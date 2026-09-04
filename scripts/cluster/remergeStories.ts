import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { cosineSimilarity, overlapCount } from "./similarity";
import { parseEmbedding, SIMILARITY_THRESHOLD_MID } from "./clusterStories";
import { extractEntityKeys } from "../../lib/entities";

/**
 * One-off re-merge pass, NOT part of the 2h ingest cron. Backfills
 * entity_keys for the ~26k pre-08-30 articles that predate the entity-key
 * system, then re-evaluates single-source stories against every other
 * story's founder for a mid-band ([SIMILARITY_THRESHOLD_MID, high)) +
 * shared-entity-key match the original run could never have found while
 * entity_keys was null. See clustering_undermerge_brainstorm.md ("Fable 5.1
 * investigation 2026-09-04") for the diagnosis this implements.
 */

export interface RemergeStory {
  storyId: string;
  founderArticleId: string;
  createdAt: string;
  embedding: number[];
  entityKeys: string[];
  /** Number of articles currently on this story. */
  articleCount: number;
}

export interface RemergeDecision {
  loserStoryId: string;
  loserArticleId: string;
  winnerStoryId: string;
  cosine: number;
}

/**
 * Decide which single-source `candidates` should be merged into some other
 * story in `allStories` (which must include the candidates themselves, since
 * two candidates can merge into each other).
 *
 * Matching mirrors clusterBySimilarity's mid-threshold+entity path, but
 * candidates are compared against the WHOLE story pool (not a 72h anchor
 * window) since this is a one-off historical pass, not the live cron.
 * High-threshold (entity-independent) matches are deliberately out of scope:
 * if two articles were ever cosine >= high, they'd have already merged
 * regardless of entity_keys, so a miss there is a temporal-window gap, not
 * the entity_keys gap this pass targets.
 *
 * Winner/loser: an existing multi-source story always wins over a
 * single-source candidate (never disturb an already-correct multi-source
 * cluster's identity for a 1-article addition). Between two single-source
 * stories, the earlier-created one wins, matching the founder_article_id
 * backfill convention (migration 0012). Note this "single-source" read is a
 * point-in-time snapshot from the caller's fetch — a survivor's articleCount
 * can go stale (1 -> 2+) mid-pass as it absorbs earlier merges, but that only
 * affects the tie-break rule applied to it, not which story survives; the
 * result stays deterministic and sane (see loop comment below).
 */
export function planRemerges(
  candidates: RemergeStory[],
  allStories: RemergeStory[]
): RemergeDecision[] {
  const byId = new Map(allStories.map((s) => [s.storyId, s]));
  const alive = new Set(allStories.map((s) => s.storyId));
  const indexByKey = new Map<string, Set<string>>();
  for (const s of allStories) {
    for (const key of s.entityKeys) {
      const set = indexByKey.get(key);
      if (set) set.add(s.storyId);
      else indexByKey.set(key, new Set([s.storyId]));
    }
  }

  const decisions: RemergeDecision[] = [];
  const sortedCandidates = [...candidates].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );

  for (const candidate of sortedCandidates) {
    if (!alive.has(candidate.storyId)) continue; // consumed as a loser earlier in this pass

    const targetIds = new Set<string>();
    for (const key of candidate.entityKeys) {
      for (const id of indexByKey.get(key) ?? []) {
        if (id !== candidate.storyId && alive.has(id)) targetIds.add(id);
      }
    }

    let best: { storyId: string; cosine: number } | null = null;
    for (const id of targetIds) {
      const target = byId.get(id)!;
      if (overlapCount(candidate.entityKeys, target.entityKeys) < 1) continue;
      const cosine = cosineSimilarity(candidate.embedding, target.embedding);
      if (cosine >= SIMILARITY_THRESHOLD_MID && (!best || cosine > best.cosine)) {
        best = { storyId: id, cosine };
      }
    }
    if (!best) continue;

    const target = byId.get(best.storyId)!;
    // Note on the staleness caveat above: this reads target.articleCount as
    // captured at fetch time. The only failure mode is treating an
    // already-augmented survivor as if it were still single-source, which
    // just re-applies the earliest-wins tie-break to it — still a valid,
    // deterministic pick (see doc comment).
    let winner = target;
    let loser = candidate;
    if (target.articleCount === 1 && Date.parse(candidate.createdAt) < Date.parse(target.createdAt)) {
      winner = candidate;
      loser = target;
    }

    decisions.push({
      loserStoryId: loser.storyId,
      loserArticleId: loser.founderArticleId,
      winnerStoryId: winner.storyId,
      cosine: best.cosine,
    });
    alive.delete(loser.storyId);
    for (const key of loser.entityKeys) indexByKey.get(key)?.delete(loser.storyId);
  }

  return decisions;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const apply = process.argv.includes("--apply");
  const supabase = createClient(supabaseUrl, serviceKey);

  console.log("Fetching all stories' founder articles...");
  const storyRows: { id: string; founder_article_id: string | null; created_at: string }[] = [];
  {
    let offset = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from("stories")
        .select("id, founder_article_id, created_at")
        .order("id")
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`Failed to fetch stories: ${error.message}`);
      storyRows.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGE) break;
      offset += PAGE;
    }
  }
  console.log(`  ${storyRows.length} stories total.`);

  const storyCountByStoryId = new Map<string, number>();
  {
    let offset = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from("articles")
        .select("story_id")
        .not("story_id", "is", null)
        .order("id")
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`Failed to fetch article story_ids: ${error.message}`);
      for (const row of (data ?? []) as { story_id: string }[]) {
        storyCountByStoryId.set(row.story_id, (storyCountByStoryId.get(row.story_id) ?? 0) + 1);
      }
      if ((data?.length ?? 0) < PAGE) break;
      offset += PAGE;
    }
  }

  const founderArticleIds = [
    ...new Set(storyRows.map((s) => s.founder_article_id).filter((id): id is string => !!id)),
  ];
  console.log(`Fetching ${founderArticleIds.length} founder articles...`);
  const founderById = new Map<
    string,
    { title: string; embedding: number[] | null; entity_keys: string[] | null }
  >();
  {
    const BATCH = 200;
    for (let i = 0; i < founderArticleIds.length; i += BATCH) {
      const batch = founderArticleIds.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from("articles")
        .select("id, title, embedding, entity_keys")
        .in("id", batch);
      if (error) throw new Error(`Failed to fetch founder articles: ${error.message}`);
      for (const row of (data ?? []) as {
        id: string;
        title: string;
        embedding: unknown;
        entity_keys: unknown;
      }[]) {
        founderById.set(row.id, {
          title: row.title,
          embedding: parseEmbedding(row.embedding),
          entity_keys: Array.isArray(row.entity_keys) ? (row.entity_keys as string[]) : null,
        });
      }
    }
  }

  const allStories: RemergeStory[] = [];
  const needsEntityBackfill: { articleId: string; entityKeys: string[] }[] = [];
  for (const s of storyRows) {
    if (!s.founder_article_id) continue;
    const founder = founderById.get(s.founder_article_id);
    if (!founder || !founder.embedding) continue;
    let entityKeys = founder.entity_keys;
    if (!entityKeys) {
      entityKeys = extractEntityKeys(founder.title);
      needsEntityBackfill.push({ articleId: s.founder_article_id, entityKeys });
    }
    allStories.push({
      storyId: s.id,
      founderArticleId: s.founder_article_id,
      createdAt: s.created_at,
      embedding: founder.embedding,
      entityKeys,
      articleCount: storyCountByStoryId.get(s.id) ?? 0,
    });
  }
  console.log(`  ${needsEntityBackfill.length} founder articles need entity_keys backfilled.`);

  const candidates = allStories.filter(
    (s) => s.articleCount === 1 && needsEntityBackfill.some((b) => b.articleId === s.founderArticleId)
  );
  console.log(`  ${candidates.length} single-source stories are re-merge candidates.`);

  const decisions = planRemerges(candidates, allStories);
  console.log(`\nPlanned ${decisions.length} merge(s):`);
  const buckets = { "0.78-0.80": 0, "0.80-0.86": 0, "0.86+": 0 };
  for (const d of decisions) {
    if (d.cosine < 0.8) buckets["0.78-0.80"]++;
    else if (d.cosine < 0.86) buckets["0.80-0.86"]++;
    else buckets["0.86+"]++;
  }
  console.log("Cosine distribution:", buckets);

  const full = process.argv.includes("--full");
  for (const d of full ? decisions : decisions.slice(0, 50)) {
    console.log(
      `  story ${d.loserStoryId} (article ${d.loserArticleId}) -> story ${d.winnerStoryId} ` +
        `(cosine ${d.cosine.toFixed(3)})`
    );
  }
  if (!full && decisions.length > 50) console.log(`  ...and ${decisions.length - 50} more.`);

  if (!apply) {
    console.log(
      "\nDry run only (pass --apply to execute). No entity_keys backfill or story_id " +
        "reassignment was written."
    );
    return;
  }

  throw new Error(
    "--apply is not implemented yet: this is staged for review before any prod write runs."
  );
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
