import { SupabaseClient } from "@supabase/supabase-js";
import { cosineSimilarity } from "../cluster/similarity";

const RECENT_STORY_WINDOW_HOURS = 72;
// A small batch, not the full backlog — each run embeds at most this many
// fact-checks, keeping this comfortably inside Gemini's separate 1,000/day
// embedding quota (learned the hard way during Week 2's backlog catch-up).
const MAX_PER_RUN = 20;

export async function matchFactChecksToStories(
  supabase: SupabaseClient,
  embedFn: (text: string) => Promise<number[]>,
  similarityThreshold: number
): Promise<number> {
  const { data: unmatched, error } = await supabase
    .from("fact_checks")
    .select("id, claim")
    .is("matched_story_id", null)
    .limit(MAX_PER_RUN);
  if (error) throw new Error(`Failed to fetch unmatched fact-checks: ${error.message}`);
  if (!unmatched || unmatched.length === 0) return 0;

  const cutoff = new Date(Date.now() - RECENT_STORY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("id, canonical_headline, summary")
    .not("canonical_headline", "is", null)
    .gte("first_seen_at", cutoff);
  if (storiesError) throw new Error(`Failed to fetch recent stories: ${storiesError.message}`);
  if (!stories || stories.length === 0) return 0;

  // Embed every unmatched fact-check's claim first (bounded by MAX_PER_RUN
  // above), then embed every recent story once, comparing each story against
  // every already-embedded claim as it comes in. This keeps the total
  // embedFn call count at exactly `stories.length + unmatched.length` — never
  // re-embedding a story per fact-check — while still finding, per
  // fact-check, its single best-matching story across the whole set.
  const claimEmbeddings: { id: string; embedding: number[] }[] = [];
  for (const factCheck of unmatched) {
    const embedding = await embedFn(factCheck.claim);
    claimEmbeddings.push({ id: factCheck.id, embedding });
  }

  const best = new Map<string, { storyId: string; similarity: number }>();
  for (const story of stories) {
    const storyEmbedding = await embedFn(`${story.canonical_headline}\n${story.summary ?? ""}`);
    for (const claim of claimEmbeddings) {
      const similarity = cosineSimilarity(claim.embedding, storyEmbedding);
      const current = best.get(claim.id);
      if (!current || similarity > current.similarity) {
        best.set(claim.id, { storyId: story.id, similarity });
      }
    }
  }

  let matched = 0;
  for (const claim of claimEmbeddings) {
    const bestMatch = best.get(claim.id);
    if (bestMatch && bestMatch.similarity >= similarityThreshold) {
      const { error: updateError } = await supabase
        .from("fact_checks")
        .update({ matched_story_id: bestMatch.storyId })
        .eq("id", claim.id);
      if (!updateError) matched += 1;
    }
  }
  return matched;
}
