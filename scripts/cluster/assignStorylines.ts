import { SupabaseClient } from "@supabase/supabase-js";
import { parseEmbedding } from "./clusterStories";
import { cosineSimilarity, overlapCount } from "./similarity";
import { extractEntityKeys } from "../../lib/entities";

// How many storyline-less headlined stories to consider per run. Not time-
// windowed by created_at (unlike the article clusterer's candidate window):
// 709 stories already have canonical_headline set and predate this feature
// (verified on prod), so a recency window would permanently exclude that
// backlog. Capping by batch size instead lets the backlog clear
// progressively (oldest first) — at 500/run this clears in about 2 runs.
const STORYLINE_CANDIDATE_BATCH_SIZE = 500;

// A storyline is "open" (eligible to receive a new story) if its most
// recently created member story falls within this window. 240h (10 days)
// matches the observed real-world span of the diagnosed example storyline.
const STORYLINE_WINDOW_HOURS = 240;

// Page size for fetching open storylines, and a hard safety ceiling across
// all pages combined. Mirrors clusterStories.ts's anchor-fetching pattern:
// a single unpaginated fetch relies on Supabase's undocumented default row
// cap (1000), and that exact assumption silently truncated results in
// production once the table outgrew it. Paginate instead.
const OPEN_STORYLINE_PAGE_SIZE = 500;
const OPEN_STORYLINE_SAFETY_CEILING = 5000;

// Looser than the clusterer's mid threshold (0.78): storyline members are
// related-but-distinct events (an announcement vs. a follow-up detail), not
// the same event reworded, so they're expected to run less similar.
const STORYLINE_SIM_THRESHOLD = 0.65;

// Stricter than the clusterer's entity floor (1): compensates for the
// looser cosine bound above so two stories aren't grouped on one generic
// shared token (e.g. a state abbreviation appearing in many unrelated
// stories).
const STORYLINE_ENTITY_MIN = 2;

interface PooledFields {
  embedding: number[];
  entityKeys: string[];
}

interface CandidateRow {
  id: string;
  canonical_headline: string;
  pooled_embedding: unknown;
  entity_keys: unknown;
}

export interface AssignStorylinesResult {
  storiesAssigned: number;
  storylinesCreated: number;
}

function toEntityKeys(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

/** Mean-pools a story's member articles' embeddings and unions their entity keys. */
async function computePooledFields(
  supabase: SupabaseClient,
  storyId: string
): Promise<PooledFields | null> {
  const { data: articles, error } = await supabase
    .from("articles")
    .select("title, embedding, entity_keys")
    .eq("story_id", storyId)
    .not("embedding", "is", null);
  if (error) {
    console.error(`Failed to fetch articles for story ${storyId}: ${error.message}`);
    return null;
  }
  if (!articles || articles.length === 0) return null;

  const embeddings: number[][] = [];
  const entityKeySet = new Set<string>();
  for (const row of articles as { title: string; embedding: unknown; entity_keys: unknown }[]) {
    const embedding = parseEmbedding(row.embedding);
    if (embedding) embeddings.push(embedding);
    // Articles ingested before entity_keys existed (or that otherwise never
    // got it persisted) fall back to deriving it from the title here, so
    // pre-existing clustered stories aren't permanently stuck with an empty
    // entity signal once cached.
    const keys = Array.isArray(row.entity_keys)
      ? (row.entity_keys as string[])
      : extractEntityKeys(row.title);
    for (const key of keys) entityKeySet.add(key);
  }
  if (embeddings.length === 0) return null;

  const dim = embeddings[0].length;
  const mean = new Array(dim).fill(0);
  let contributors = 0;
  for (const embedding of embeddings) {
    if (embedding.length !== dim) continue;
    for (let i = 0; i < dim; i++) mean[i] += embedding[i];
    contributors += 1;
  }
  for (let i = 0; i < dim; i++) mean[i] /= contributors;

  return { embedding: mean, entityKeys: [...entityKeySet] };
}

export async function assignStorylines(supabase: SupabaseClient): Promise<AssignStorylinesResult> {
  const empty: AssignStorylinesResult = { storiesAssigned: 0, storylinesCreated: 0 };

  const { data: candidates, error: candidatesError } = await supabase
    .from("stories")
    .select("id, canonical_headline, pooled_embedding, entity_keys")
    .is("storyline_id", null)
    .not("canonical_headline", "is", null)
    .order("created_at", { ascending: true })
    .limit(STORYLINE_CANDIDATE_BATCH_SIZE);
  if (candidatesError) {
    throw new Error(`Failed to fetch storyline candidates: ${candidatesError.message}`);
  }
  if (!candidates || candidates.length === 0) return empty;

  const openCutoff = new Date(Date.now() - STORYLINE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const openRows: {
    id: string;
    storyline_id: string;
    pooled_embedding: unknown;
    entity_keys: unknown;
    created_at: string;
  }[] = [];
  let openOffset = 0;
  while (true) {
    const { data: page, error: openError } = await supabase
      .from("stories")
      .select("id, storyline_id, pooled_embedding, entity_keys, created_at")
      .not("storyline_id", "is", null)
      .gte("created_at", openCutoff)
      .order("created_at", { ascending: false })
      // created_at is not unique, so ties could otherwise be ordered
      // differently between page requests and skip/duplicate rows across
      // .range() boundaries. id breaks the tie deterministically.
      .order("id")
      .range(openOffset, openOffset + OPEN_STORYLINE_PAGE_SIZE - 1);
    if (openError) {
      throw new Error(`Failed to fetch open storylines: ${openError.message}`);
    }
    openRows.push(...(page ?? []));

    if ((page?.length ?? 0) < OPEN_STORYLINE_PAGE_SIZE) break;
    if (openRows.length >= OPEN_STORYLINE_SAFETY_CEILING) {
      console.warn(
        `Open storyline set hit the ${OPEN_STORYLINE_SAFETY_CEILING}-row safety ceiling; ` +
          `older open storylines in the ${STORYLINE_WINDOW_HOURS}h window were not ` +
          `considered for matching. Investigate storyline volume growth.`
      );
      break;
    }
    openOffset += OPEN_STORYLINE_PAGE_SIZE;
  }

  // Rows arrive most-recent-first, so the first row seen per storyline_id is
  // that storyline's representative (its latest member story).
  const representatives = new Map<string, PooledFields>();
  for (const row of openRows) {
    if (representatives.has(row.storyline_id)) continue;
    const embedding = parseEmbedding(row.pooled_embedding);
    if (!embedding) continue;
    representatives.set(row.storyline_id, { embedding, entityKeys: toEntityKeys(row.entity_keys) });
  }

  let storiesAssigned = 0;
  let storylinesCreated = 0;

  for (const candidate of candidates as CandidateRow[]) {
    let pooled: PooledFields | null = null;
    const cachedEmbedding = parseEmbedding(candidate.pooled_embedding);
    if (cachedEmbedding) {
      pooled = { embedding: cachedEmbedding, entityKeys: toEntityKeys(candidate.entity_keys) };
    } else {
      pooled = await computePooledFields(supabase, candidate.id);
      if (!pooled) continue; // no embedded articles yet; retry next run
      const { error: cacheError } = await supabase
        .from("stories")
        .update({ pooled_embedding: pooled.embedding, entity_keys: pooled.entityKeys })
        .eq("id", candidate.id);
      if (cacheError) {
        console.error(`Failed to cache pooled fields for story ${candidate.id}: ${cacheError.message}`);
      }
    }

    let bestMatch: string | null = null;
    let bestSim = -1;
    for (const [storylineId, rep] of representatives) {
      if (rep.embedding.length !== pooled.embedding.length) continue;
      const sim = cosineSimilarity(rep.embedding, pooled.embedding);
      if (sim < STORYLINE_SIM_THRESHOLD) continue;
      if (overlapCount(rep.entityKeys, pooled.entityKeys) < STORYLINE_ENTITY_MIN) continue;
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = storylineId;
      }
    }

    if (bestMatch) {
      const { data: storylineRow } = await supabase
        .from("storylines")
        .select("title")
        .eq("id", bestMatch)
        .single();
      if (storylineRow && storylineRow.title == null) {
        const { error: titleError } = await supabase
          .from("storylines")
          .update({ title: candidate.canonical_headline })
          .eq("id", bestMatch);
        if (titleError) {
          console.error(`Failed to backfill title for storyline ${bestMatch}: ${titleError.message}`);
        }
      }

      const { error: assignError } = await supabase
        .from("stories")
        .update({ storyline_id: bestMatch })
        .eq("id", candidate.id);
      if (assignError) {
        console.error(`Failed to assign story ${candidate.id} to storyline ${bestMatch}: ${assignError.message}`);
        continue;
      }
      storiesAssigned += 1;
      continue;
    }

    const { data: storyline, error: insertError } = await supabase
      .from("storylines")
      .insert({ title: candidate.canonical_headline })
      .select("id")
      .single();
    if (insertError || !storyline) {
      console.error(`Failed to create storyline for story ${candidate.id}: ${insertError?.message}`);
      continue;
    }
    const { error: assignError } = await supabase
      .from("stories")
      .update({ storyline_id: storyline.id })
      .eq("id", candidate.id);
    if (assignError) {
      console.error(`Failed to assign story ${candidate.id} to new storyline ${storyline.id}: ${assignError.message}`);
      continue;
    }
    representatives.set(storyline.id, pooled);
    storiesAssigned += 1;
    storylinesCreated += 1;
  }

  return { storiesAssigned, storylinesCreated };
}
