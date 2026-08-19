import { SupabaseClient } from "@supabase/supabase-js";
import { clusterBySimilarity, EmbeddedArticle } from "./similarity";

const SIMILARITY_THRESHOLD = 0.86;

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

// Hard safety ceiling across ALL pages combined. Not expected to be hit in
// normal operation — it exists so a runaway anchor window (a clustering bug
// that stops assigning story_id, or a large outlet-count spike) degrades to a
// loud warning instead of an unbounded fetch loop.
const ANCHOR_SAFETY_CEILING = 5000;

interface UnclusteredArticle {
  id: string;
  title: string;
  snippet: string | null;
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
    .select("id, title, snippet")
    .is("story_id", null)
    .or(`published_at.is.null,published_at.gte.${unclusteredCutoff}`);

  if (error) throw new Error(`Failed to fetch unclustered articles: ${error.message}`);
  if (!articles || articles.length === 0) {
    return empty;
  }

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
    newEmbedded.push({ id: article.id, embedding });

    // Persist the embedding. These are load-bearing: they are read back as
    // anchors on later runs, so a silent write failure would quietly degrade
    // clustering forever. Log and continue (same per-item error tolerance the
    // ingest script uses) — the in-memory embedding is still valid for this run.
    const { error: embeddingWriteError } = await supabase
      .from("articles")
      .update({ embedding })
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

  const anchorRows: { id: string; story_id: string; embedding: unknown }[] = [];
  let anchorOffset = 0;
  while (true) {
    const { data: page, error: anchorError } = await supabase
      .from("articles")
      .select("id, story_id, embedding")
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
  const anchorStoryById = new Map<string, string>();
  const anchorEmbedded: EmbeddedArticle[] = [];
  for (const row of anchorRows as { id: string; story_id: string; embedding: unknown }[]) {
    const embedding = parseEmbedding(row.embedding);
    // cosineSimilarity throws on a length mismatch, so drop anything that
    // isn't the current embedding dimension rather than killing the run.
    if (!embedding || embedding.length !== expectedDim || !row.story_id) continue;
    anchorStoryById.set(row.id, row.story_id);
    anchorEmbedded.push({ id: row.id, embedding });
  }

  // Anchors go first: clusterBySimilarity is greedy single-link and places an
  // article in the FIRST cluster it matches, so seeding the cluster list with
  // anchors makes "join an existing story" win over "start a new one".
  const clusters = clusterBySimilarity(
    [...anchorEmbedded, ...newEmbedded],
    SIMILARITY_THRESHOLD
  );

  let clustersCreated = 0;
  let articlesClustered = 0;
  let articlesMergedIntoExisting = 0;

  for (const cluster of clusters) {
    const anchorIds = cluster.articleIds.filter((id) => anchorStoryById.has(id));
    const newIds = cluster.articleIds.filter((id) => !anchorStoryById.has(id));

    // Anchor-only cluster: an existing story picked up no new coverage.
    if (newIds.length === 0) continue;

    if (anchorIds.length > 0) {
      const storyIds = anchorIds.map((id) => anchorStoryById.get(id) as string);
      const distinct = new Set(storyIds);
      if (distinct.size > 1) {
        // Transitive single-link chaining can bridge two previously separate
        // stories. We don't merge the stories themselves (that would need
        // re-pointing every article and deleting a row the feed may link to);
        // we deterministically pick the first anchor's story for the new
        // articles and log it for observability.
        console.warn(
          `Cluster spans ${distinct.size} existing stories (${[...distinct].join(", ")}); ` +
            `assigning ${newIds.length} new article(s) to ${storyIds[0]}`
        );
      }
      const targetStoryId = storyIds[0];
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
      .insert({})
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
