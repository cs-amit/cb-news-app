import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { clusterUnclusteredArticles } from "./clusterStories";
import { embedText } from "./embed";
import { fillMissingHeadlines } from "../summarize/fillMissingHeadlines";
import { generateBatchHeadlines } from "../summarize/generateBatchHeadlines";
import { flagStoryConflicts } from "../conflict/flagStoryConflicts";
import { assignStorylines } from "./assignStorylines";

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !serviceKey || !geminiKey) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY must be set");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const result = await clusterUnclusteredArticles(supabase, (text) => embedText(text, geminiKey));
  console.log(
    `Clustered ${result.articlesClustered} articles: ` +
      `${result.clustersCreated} new stories created, ` +
      `${result.articlesMergedIntoExisting} articles merged into existing stories.`
  );

  // Conflict flagging is an enhancement layered on top of the core pipeline. A
  // transient failure here must not abort the run before headline generation —
  // headlines are the Week 1 core functionality and are already rate-limited to
  // a handful of runs a day, so losing a tick to an unrelated feature is a real
  // cost. Log and continue, matching how fillMissingHeadlines treats its own
  // non-critical failures.
  try {
    const conflictCount = await flagStoryConflicts(supabase);
    console.log(`Flagged ${conflictCount} conflict(s) of interest.`);
  } catch (err) {
    console.error(
      "Failed to flag conflicts of interest; continuing to headline generation:",
      err instanceof Error ? err.message : err
    );
  }

  // Individual headline failures (chiefly daily Gemini quota exhaustion) are
  // logged inside fillMissingHeadlines and do not fail the run. Only a genuine
  // fault — missing config, an unreachable Supabase, a total embedding outage —
  // reaches the catch below and exits non-zero, so a red run means a real problem.
  const headlineCount = await fillMissingHeadlines(supabase, (batch) =>
    generateBatchHeadlines(batch, geminiKey)
  );
  console.log(`Generated headlines for ${headlineCount} stories.`);

  // Storyline assignment needs canonical_headline (to title a newly-founded
  // storyline), so it runs after headline generation. Same non-fatal
  // tolerance as conflict flagging above — this is an enhancement layered on
  // the core pipeline, not something that should ever fail the run.
  try {
    const { storiesAssigned, storylinesCreated } = await assignStorylines(supabase);
    console.log(
      `Assigned ${storiesAssigned} storie(s) to storylines, ${storylinesCreated} new storyline(s) created.`
    );
  } catch (err) {
    console.error(
      "Failed to assign storylines; continuing:",
      err instanceof Error ? err.message : err
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
