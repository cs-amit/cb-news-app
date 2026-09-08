import { SupabaseClient } from "@supabase/supabase-js";
import { clusterBySimilarity, EmbeddedArticle } from "./similarity";
import { extractEntityKeys } from "../../lib/entities";
import { chunk } from "../../lib/chunk";
import { mergeStories } from "./mergeStories";

export const SIMILARITY_THRESHOLD_HIGH = 0.86;
export const SIMILARITY_THRESHOLD_MID = 0.78;

// How far back to look for articles that still need clustering.
const UNCLUSTERED_WINDOW_HOURS = 48;

// How far back to look for "anchor" articles: articles that already belong to
// a story and whose embeddings we re-use so that new coverage of an ongoing
// story merges into the existing story instead of spawning a duplicate.
// 72h is deliberately wider than the unclustered window: the cron runs every
// 2h, so a story first seen just outside the 48h window can still legitimately
// pick up late coverage. Bounded by created_at (ingest time, NOT NULL) rather
// than published_at so the anchor set stays finite and is unaffected by rows
// with a missing RSS date.
const ANCHOR_WINDOW_HOURS = 72;

// Page size for fetching anchors. 500 is a reasonable page size chosen for this
// codebase (it carries over the Week 1 `.limit(500)` this loop replaced); it is
// not tied to any platform default — PostgREST's `max-rows` has no default at
// all, and Supabase's platform default is 1000.
const ANCHOR_PAGE_SIZE = 500;

// Hard safety ceiling across ALL pages combined. It exists so a runaway
// anchor window (a clustering bug that stops assigning story_id, or a large
// outlet-count spike) degrades to a loud warning instead of an unbounded
// fetch loop -- it is NOT meant to bound normal steady-state volume, which
// should sit comfortably under it. Recalibrated 2026-09-08: real trailing-72h
// volume settled at ~2,600 articles/day (7,600/72h) after the initial
// ingestion backlog, versus this constant's original 5,000 -- meaning every
// run was silently hitting the ceiling and skipping ~2,000+ real anchors from
// merge consideration. 15,000 gives headroom for the ~3,900/day peak already
// observed (11,700/72h) plus real growth room, not just today's number.
const ANCHOR_SAFETY_CEILING = 15000;

// Batch size for founder-resolution .in() lookups. These ids come from the
// anchor set, which can run into the thousands near ANCHOR_SAFETY_CEILING;
// a single .in() with that many UUIDs blows past the request URL length
// limit and fails before it even reaches Supabase's edge (no PostgREST error
// detail, no edge log entry — a 2026-09-04 prod outage traced this to a
// silently-empty-message thrown error). Page through ids in bounded batches
// instead, mirroring the anchor fetch's own pagination.
const FOUNDER_LOOKUP_BATCH_SIZE = 200;

interface UnclusteredArticle {
  id: string;
  title: string;
  snippet: string | null;
  image_url: string | null;
}

export interface ClusterRunResult {
  /** Genuinely NEW stories rows inserted this run (merges are not counted). */
  clustersCreated: number;
  /** Total articles newly assigned to a story this run (new + merged). */
  articlesClustered: number;
  /** Subset of articlesClustered that joined a pre-existing story. */
  articlesMergedIntoExisting: number;
}

/**
 * pgvector columns come back through PostgREST as a JSON *string*
 * (e.g. "[0.01,-0.02,...]"), not as a number[]. Parse defensively and return
 * null for anything unusable so one bad row can't take down the run.
 */
export function parseEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    return value.every((n) => typeof n === "number") ? (value as number[]) : null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every((n) => typeof n === "number")) {
        return parsed as number[];
      }
    } catch {
      return null;
    }
  }
  return null;
}

export async function clusterUnclusteredArticles(
  supabase: SupabaseClient,
  embedFn: (text: string) => Promise<number[]>
): Promise<ClusterRunResult> {
  const empty: ClusterRunResult = {
    clustersCreated: 0,
    articlesClustered: 0,
    articlesMergedIntoExisting: 0,
  };

  const unclusteredCutoff = new Date(
    Date.now() - UNCLUSTERED_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  // `.gte("published_at", cutoff)` is NULL (and therefore excluded) for rows
  // where published_at is null. fetchFeed maps a missing RSS date to null and
  // articles are never re-ingested (unique url), so those rows would be
  // invisible to clustering forever. Include them explicitly.
  const { data: articles, error } = await supabase
    .from("articles")
    .select("id, title, snippet, image_url")
    .is("story_id", null)
    .or(`published_at.is.null,published_at.gte.${unclusteredCutoff}`);

  if (error) throw new Error(`Failed to fetch unclustered articles: ${error.message}`);
  if (!articles || articles.length === 0) {
    return empty;
  }

  // Set once at story-creation time from whichever article founds it, same
  // "never re-derived" convention as founder_article_id — a representative
  // thumbnail is good enough for a feed card; it doesn't need to track the
  // story's best available image as coverage accumulates.
  const imageUrlByArticleId = new Map(
    (articles as UnclusteredArticle[]).map((a) => [a.id, a.image_url])
  );

  // Embed the new articles. A single embedding failure (e.g. a transient
  // Gemini error) skips just that article rather than aborting the run; if
  // *every* embedding fails we treat that as a real outage and throw.
  const newEmbedded: EmbeddedArticle[] = [];
  let embedFailures = 0;
  for (const article of articles as UnclusteredArticle[]) {
    let embedding: number[];
    try {
      embedding = await embedFn(`${article.title}\n${article.snippet ?? ""}`);
    } catch (err) {
      embedFailures += 1;
      console.error(
        `Failed to embed article ${article.id}:`,
        err instanceof Error ? err.message : err
      );
      continue;
    }
    const entityKeys = extractEntityKeys(article.title);
    newEmbedded.push({ id: article.id, embedding, entityKeys });

    // Persist the embedding. These are load-bearing: they are read back as
    // anchors on later runs, so a silent write failure would quietly degrade
    // clustering forever. Log and continue (same per-item error tolerance the
    // ingest script uses) — the in-memory embedding is still valid for this run.
    const { error: embeddingWriteError } = await supabase
      .from("articles")
      .update({ embedding, entity_keys: entityKeys })
      .eq("id", article.id);
    if (embeddingWriteError) {
      console.error(
        `Failed to persist embedding for article ${article.id}: ${embeddingWriteError.message}`
      );
    }
  }

  if (newEmbedded.length === 0) {
    throw new Error(
      `Failed to embed any of the ${embedFailures} candidate articles; embedding backend appears unavailable`
    );
  }

  // Anchors: already-clustered recent articles, so new coverage can join the
  // story they belong to instead of creating a parallel duplicate story.
  // Paginate through the FULL window instead of taking a single capped page —
  // a fixed cap silently drops older anchors once the live table outgrows it
  // (this happened in production: the 500-row cap started truncating within
  // days of shipping), which quietly degrades merge recall with no visible
  // signal that anything was wrong.
  const anchorCutoff = new Date(
    Date.now() - ANCHOR_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  const anchorRows: { id: string; story_id: string; embedding: unknown; entity_keys: unknown }[] = [];
  let anchorOffset = 0;
  while (true) {
    const { data: page, error: anchorError } = await supabase
      .from("articles")
      .select("id, story_id, embedding, entity_keys")
      .not("story_id", "is", null)
      .not("embedding", "is", null)
      .gte("created_at", anchorCutoff)
      .order("created_at", { ascending: false })
      // created_at is not unique, so ties could otherwise be ordered
      // differently between page requests and skip/duplicate rows across
      // .range() boundaries. id breaks the tie deterministically.
      .order("id")
      .range(anchorOffset, anchorOffset + ANCHOR_PAGE_SIZE - 1);

    if (anchorError) {
      throw new Error(`Failed to fetch anchor articles: ${anchorError.message}`);
    }
    anchorRows.push(...(page ?? []));

    if ((page?.length ?? 0) < ANCHOR_PAGE_SIZE) break;
    if (anchorRows.length >= ANCHOR_SAFETY_CEILING) {
      console.warn(
        `Anchor set hit the ${ANCHOR_SAFETY_CEILING}-row safety ceiling; older ` +
          `clustered articles in the ${ANCHOR_WINDOW_HOURS}h window were not ` +
          `considered for merging. Investigate anchor volume growth.`
      );
      break;
    }
    anchorOffset += ANCHOR_PAGE_SIZE;
  }

  const expectedDim = newEmbedded[0].embedding.length;

  // Resolve each anchor story's TRUE founding article, so the mid-threshold+
  // entity path in clusterBySimilarity always compares against a stable
  // reference instead of whichever anchor row array order happens to place
  // first (cluster[0]) — for a continuously-active story that's effectively
  // "whatever was most recently merged," which drifts over time ("zombie
  // anchor" bug). Stories created before founder tracking existed, or whose
  // founder article's embedding can't be resolved, simply get no override
  // and fall back to today's cluster[0] behavior.
  const distinctAnchorStoryIds = [
    ...new Set(anchorRows.map((r) => r.story_id).filter((id): id is string => !!id)),
  ];
  const founderDataByStory = new Map<string, { embedding: number[]; entityKeys: string[] }>();

  if (distinctAnchorStoryIds.length > 0) {
    const founderArticleIdByStory = new Map<string, string>();
    for (const idBatch of chunk(distinctAnchorStoryIds, FOUNDER_LOOKUP_BATCH_SIZE)) {
      const { data: storyRows, error: storyFounderError } = await supabase
        .from("stories")
        .select("id, founder_article_id")
        .in("id", idBatch);
      if (storyFounderError) {
        throw new Error(`Failed to fetch story founders: ${storyFounderError.message}`);
      }
      for (const row of (storyRows ?? []) as { id: string; founder_article_id: string | null }[]) {
        if (row.founder_article_id) founderArticleIdByStory.set(row.id, row.founder_article_id);
      }
    }
    const founderArticleIds = [...new Set(founderArticleIdByStory.values())];

    if (founderArticleIds.length > 0) {
      const founderDataById = new Map<string, { embedding: number[]; entityKeys: string[] }>();
      for (const idBatch of chunk(founderArticleIds, FOUNDER_LOOKUP_BATCH_SIZE)) {
        const { data: founderRows, error: founderArticlesError } = await supabase
          .from("articles")
          .select("id, embedding, entity_keys")
          .in("id", idBatch);
        if (founderArticlesError) {
          throw new Error(`Failed to fetch founder articles: ${founderArticlesError.message}`);
        }
        for (const row of (founderRows ?? []) as {
          id: string;
          embedding: unknown;
          entity_keys: unknown;
        }[]) {
          const embedding = parseEmbedding(row.embedding);
          if (!embedding || embedding.length !== expectedDim) continue;
          const entityKeys = Array.isArray(row.entity_keys) ? (row.entity_keys as string[]) : [];
          founderDataById.set(row.id, { embedding, entityKeys });
        }
      }
      for (const [storyId, founderArticleId] of founderArticleIdByStory) {
        const data = founderDataById.get(founderArticleId);
        if (data) founderDataByStory.set(storyId, data);
      }
    }
  }

  const anchorStoryById = new Map<string, string>();
  const anchorEmbedded: EmbeddedArticle[] = [];
  for (const row of anchorRows) {
    const embedding = parseEmbedding(row.embedding);
    // cosineSimilarity throws on a length mismatch, so drop anything that
    // isn't the current embedding dimension rather than killing the run.
    if (!embedding || embedding.length !== expectedDim || !row.story_id) continue;
    const entityKeys = Array.isArray(row.entity_keys) ? (row.entity_keys as string[]) : [];
    anchorStoryById.set(row.id, row.story_id);
    const founder = founderDataByStory.get(row.story_id);
    anchorEmbedded.push({
      id: row.id,
      embedding,
      entityKeys,
      founderEmbedding: founder?.embedding,
      founderEntityKeys: founder?.entityKeys,
    });
  }

  // Anchors go first: clusterBySimilarity is greedy single-link and places an
  // article in the FIRST cluster it matches, so seeding the cluster list with
  // anchors makes "join an existing story" win over "start a new one".
  const clusters = clusterBySimilarity(
    [...anchorEmbedded, ...newEmbedded],
    SIMILARITY_THRESHOLD_HIGH,
    SIMILARITY_THRESHOLD_MID
  );

  let clustersCreated = 0;
  let articlesClustered = 0;
  let articlesMergedIntoExisting = 0;

  // A story with many anchor rows (a large, active story) can have those
  // rows split across several DISJOINT output clusters from a single
  // clusterBySimilarity call -- clustering groups by pairwise similarity
  // among the input articles, not by story identity, so nothing guarantees
  // one story's anchors all land in the same cluster. That means a story
  // merged away as a loser earlier in this loop can still be the naive
  // target of a later, unrelated cluster in the SAME run. Track every
  // loser -> winner redirect as we go and resolve through it before ever
  // using a story id, so a later cluster follows the chain to whichever
  // story is still actually alive instead of hitting the now-deleted row.
  const storyAlias = new Map<string, string>();
  const resolveStory = (id: string): string => {
    let current = id;
    while (storyAlias.has(current)) current = storyAlias.get(current)!;
    return current;
  };

  for (const cluster of clusters) {
    const anchorIds = cluster.articleIds.filter((id) => anchorStoryById.has(id));
    const newIds = cluster.articleIds.filter((id) => !anchorStoryById.has(id));

    // Anchor-only cluster: an existing story picked up no new coverage.
    if (newIds.length === 0) continue;

    if (anchorIds.length > 0) {
      const storyIds = anchorIds.map((id) => resolveStory(anchorStoryById.get(id) as string));
      const distinct = new Set(storyIds);
      let targetStoryId: string;
      if (distinct.size > 1) {
        // Transitive single-link chaining has bridged multiple previously
        // separate stories that are, by the same similarity signal already
        // trusted everywhere else in this function, the same underlying
        // event. Consolidate them into the earliest-created one (matching
        // the founder_article_id convention: the earliest article is a
        // faithful stand-in for the story's true origin) rather than
        // silently discarding the other N-1 stories' existence, which
        // otherwise left them to grow independently forever.
        const { data: spannedStories, error: spanError } = await supabase
          .from("stories")
          .select("id, created_at")
          .in("id", [...distinct]);
        if (spanError || !spannedStories || spannedStories.length === 0) {
          throw new Error(
            `Failed to fetch spanned stories for merge: ${spanError?.message ?? "no rows returned"}`
          );
        }
        const survivor = spannedStories.reduce((earliest, s) =>
          new Date(s.created_at) < new Date(earliest.created_at) ? s : earliest
        );
        const losers = [...distinct].filter((id) => id !== survivor.id);
        console.warn(
          `Cluster spans ${distinct.size} existing stories (${[...distinct].join(", ")}); ` +
            `merging into ${survivor.id} (earliest) and assigning ${newIds.length} new article(s) to it`
        );
        await mergeStories(supabase, losers, survivor.id);
        for (const loser of losers) storyAlias.set(loser, survivor.id);
        targetStoryId = survivor.id;
      } else {
        targetStoryId = storyIds[0];
      }
      const { error: mergeError } = await supabase
        .from("articles")
        .update({ story_id: targetStoryId })
        .in("id", newIds);
      if (mergeError) {
        throw new Error(`Failed to merge articles into story: ${mergeError.message}`);
      }
      articlesClustered += newIds.length;
      articlesMergedIntoExisting += newIds.length;
      continue;
    }

    const { data: story, error: storyError } = await supabase
      .from("stories")
      .insert({ founder_article_id: newIds[0], image_url: imageUrlByArticleId.get(newIds[0]) ?? null })
      .select("id")
      .single();
    if (storyError || !story) {
      throw new Error(`Failed to create story: ${storyError?.message}`);
    }
    const { error: updateError } = await supabase
      .from("articles")
      .update({ story_id: story.id })
      .in("id", newIds);
    if (updateError) {
      throw new Error(`Failed to assign articles to story: ${updateError.message}`);
    }
    clustersCreated += 1;
    articlesClustered += newIds.length;
  }

  return { clustersCreated, articlesClustered, articlesMergedIntoExisting };
}
