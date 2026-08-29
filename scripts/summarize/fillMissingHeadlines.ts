import { SupabaseClient } from "@supabase/supabase-js";
import { StoryForBatch, StorySummary } from "./generateBatchHeadlines";

// One batched LLM request generates headlines for up to BATCH_SIZE stories at
// once, instead of the old one-request-per-story design (which capped real
// throughput at the Gemini free tier's ~20 generateContent requests/day — in
// production this meant only 6 of 222 stories created in a 4h window got a
// real headline). The 2-hourly cron means at most 12 runs/day; capping each
// run to exactly one batch request (MAX_STORIES_PER_RUN === BATCH_SIZE) keeps
// worst-case usage at 12 requests/day, safely under the 20/day quota with
// headroom for manual/backfill runs, while raising effective headline
// throughput to up to 12 * BATCH_SIZE stories/day.
const BATCH_SIZE = 20;
const MAX_STORIES_PER_RUN = BATCH_SIZE;

export async function fillMissingHeadlines(
  supabase: SupabaseClient,
  generateFn: (stories: StoryForBatch[]) => Promise<Map<string, StorySummary>>
): Promise<number> {
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id")
    .is("canonical_headline", null)
    .order("first_seen_at", { ascending: false })
    .limit(MAX_STORIES_PER_RUN);
  if (error) throw new Error(`Failed to fetch stories needing headlines: ${error.message}`);
  if (!stories || stories.length === 0) return 0;

  const batch: StoryForBatch[] = [];
  for (const story of stories) {
    const { data: articles, error: articlesError } = await supabase
      .from("articles")
      .select("title, outlet:outlets(name)")
      .eq("story_id", story.id);
    if (articlesError || !articles || articles.length === 0) continue;
    batch.push({
      id: story.id,
      articles: articles.map((a: any) => ({
        title: a.title,
        outletName: a.outlet?.name ?? "Unknown",
      })),
    });
  }
  if (batch.length === 0) return 0;

  // Quota exhaustion mid-batch is the NORMAL case, not a failure of the job
  // (same reasoning as the old per-story design): letting it propagate would
  // make run.ts exit(1) on nearly every cron tick.
  let results: Map<string, StorySummary>;
  try {
    results = await generateFn(batch);
  } catch (err) {
    console.error("Failed to generate batch headlines:", err instanceof Error ? err.message : err);
    return 0;
  }

  let updated = 0;
  for (const story of batch) {
    const result = results.get(story.id);
    if (!result) {
      console.error(`Batch response did not include a headline for story ${story.id}`);
      continue;
    }
    const { error: updateError } = await supabase
      .from("stories")
      .update({ canonical_headline: result.headline, summary: result.summary, topic: result.topic })
      .eq("id", story.id);
    if (updateError) {
      console.error(`Failed to save headline for story ${story.id}: ${updateError.message}`);
      continue;
    }
    updated += 1;
  }
  return updated;
}
