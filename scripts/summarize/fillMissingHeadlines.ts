import { SupabaseClient } from "@supabase/supabase-js";
import { StoryForBatch, StorySummary } from "./generateBatchHeadlines";

// One batched LLM request generates headlines for up to BATCH_SIZE stories at
// once, instead of the old one-request-per-story design. The original
// single-batch-per-run design assumed a ~20 generateContent requests/day free
// tier quota; that figure was never reconciled against the actual
// gemini-flash-latest free-tier quota (externally reported as 250-1500
// RPD depending on source — both far higher than 20), and 27k+ stories with
// only ~4% ever headlined confirms the real backlog is much larger than one
// batch/run can touch. MAX_REQUESTS_PER_RUN issues up to that many batch
// calls in a single run instead of exactly one; at 15 * 12 (2-hourly cron) =
// 180 requests/day, this stays well under even the most conservative
// published RPD figure, leaving headroom for manual/backfill runs. A quota
// failure mid-run still stops the loop immediately (see below) rather than
// hammering further doomed requests, so a wrong guess here degrades
// gracefully instead of breaking the cron.
const BATCH_SIZE = 20;
const MAX_REQUESTS_PER_RUN = 15;
const MAX_STORIES_PER_RUN = BATCH_SIZE * MAX_REQUESTS_PER_RUN;

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

  let updated = 0;
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);

    // Quota exhaustion mid-run is the NORMAL case, not a failure of the job
    // (same reasoning as the old per-story design): letting it propagate
    // would make run.ts exit(1) on nearly every cron tick. Stop at the first
    // failure rather than trying further chunks — once the day's quota is
    // exhausted, later chunks will fail the same way, so there's no value in
    // hammering them (and real value in not risking a cascading rate-limit
    // penalty).
    let results: Map<string, StorySummary>;
    try {
      results = await generateFn(chunk);
    } catch (err) {
      console.error("Failed to generate batch headlines:", err instanceof Error ? err.message : err);
      break;
    }

    for (const story of chunk) {
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
  }
  return updated;
}
