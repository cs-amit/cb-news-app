import { SupabaseClient } from "@supabase/supabase-js";
import { StoryForBatch, StorySummary } from "./generateBatchHeadlines";
import { fillMissingHeadlines } from "./fillMissingHeadlines";

// One-off backfill driver, NOT wired into the live 2h cron. fillMissingHeadlines
// caps itself at MAX_STORIES_PER_RUN (300) per call so a single automated cron
// tick can't blow past Gemini's per-minute/per-day quota. That's the right
// limit for an unattended recurring job, but it also means draining a large
// pre-existing backlog through the cron alone takes days (e.g. ~19k eligible
// stories / 300 per 2h tick = ~5+ days) -- and until the backlog drains, no
// *newer* story ever gets a turn either (oldest-first), so the visible feed
// stays frozen. This calls fillMissingHeadlines repeatedly in one sitting,
// with the same inter-request spacing discipline, until the backlog is
// actually empty -- same total request volume as spreading it over days
// (this is a timing change, not a new volume of work), just not artificially
// paced by an unrelated per-run cap.
const DEFAULT_MAX_ITERATIONS = 200;

export async function drainHeadlineBacklog(
  supabase: SupabaseClient,
  generateFn: (stories: StoryForBatch[]) => Promise<Map<string, StorySummary>>,
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  spacingMs = 7000,
  maxIterations = DEFAULT_MAX_ITERATIONS
): Promise<{ totalHeadlined: number; iterations: number }> {
  let totalHeadlined = 0;
  let iterations = 0;

  while (iterations < maxIterations) {
    if (iterations > 0) await sleepFn(spacingMs);
    const count = await fillMissingHeadlines(supabase, generateFn, sleepFn);
    iterations += 1;
    totalHeadlined += count;
    if (count === 0) break;
  }

  if (iterations >= maxIterations) {
    console.warn(
      `drainHeadlineBacklog hit its ${maxIterations}-iteration safety ceiling without emptying ` +
        `the backlog. Re-run to continue, and consider raising maxIterations if this recurs.`
    );
  }

  return { totalHeadlined, iterations };
}
