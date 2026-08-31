import { SupabaseClient } from "@supabase/supabase-js";
import { parseEmbedding } from "./clusterStories";
import { cosineSimilarity, overlapCount } from "./similarity";

// How many storyline-less headlined stories to consider per run. Not time-
// windowed by created_at (unlike the article clusterer's candidate window):
// ~17.9k stories already have canonical_headline set and predate this
// feature, so a recency window would permanently exclude the entire
// backlog. Capping by batch size instead lets the backlog clear
// progressively (oldest first) across successive 2h cron ticks.
const STORYLINE_CANDIDATE_BATCH_SIZE = 500;

// A storyline is "open" (eligible to receive a new story) if its most
// recently created member story falls within this window. 240h (10 days)
// matches the observed real-world span of the diagnosed example storyline.
const STORYLINE_WINDOW_HOURS = 240;

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
    .select("embedding, entity_keys")
    .eq("story_id", storyId)
    .not("embedding", "is", null);
  if (error) {
    console.error(`Failed to fetch articles for story ${storyId}: ${error.message}`);
    return null;
  }
  if (!articles || articles.length === 0) return null;

  const embeddings: number[][] = [];
  const entityKeySet = new Set<string>();
  for (const row of articles as { embedding: unknown; entity_keys: unknown }[]) {
    const embedding = parseEmbedding(row.embedding);
    if (embedding) embeddings.push(embedding);
    for (const key of toEntityKeys(row.entity_keys)) entityKeySet.add(key);
  }
  if (embeddings.length === 0) return null;

  const dim = embeddings[0].length;
  const mean = new Array(dim).fill(0);
  for (const embedding of embeddings) {
    if (embedding.length !== dim) continue;
    for (let i = 0; i < dim; i++) mean[i] += embedding[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= embeddings.length;

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
  const { data: openRows, error: openError } = await supabase
    .from("stories")
    .select("storyline_id, pooled_embedding, entity_keys, created_at")
    .not("storyline_id", "is", null)
    .gte("created_at", openCutoff)
    .order("created_at", { ascending: false });
  if (openError) {
    throw new Error(`Failed to fetch open storylines: ${openError.message}`);
  }

  // Rows arrive most-recent-first, so the first row seen per storyline_id is
  // that storyline's representative (its latest member story).
  const representatives = new Map<string, PooledFields>();
  for (const row of (openRows ?? []) as {
    storyline_id: string;
    pooled_embedding: unknown;
    entity_keys: unknown;
  }[]) {
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
