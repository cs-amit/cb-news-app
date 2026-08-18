import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { clusterUnclusteredArticles } from "./clusterStories";
import { embedText } from "./embed";
import { fillMissingHeadlines } from "../summarize/fillMissingHeadlines";
import { generateBatchHeadlines } from "../summarize/generateBatchHeadlines";

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

  // Individual headline failures (chiefly daily Gemini quota exhaustion) are
  // logged inside fillMissingHeadlines and do not fail the run. Only a genuine
  // fault — missing config, an unreachable Supabase, a total embedding outage —
  // reaches the catch below and exits non-zero, so a red run means a real problem.
  const headlineCount = await fillMissingHeadlines(supabase, (batch) =>
    generateBatchHeadlines(batch, geminiKey)
  );
  console.log(`Generated headlines for ${headlineCount} stories.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
