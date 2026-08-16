import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { clusterUnclusteredArticles } from "./clusterStories";
import { embedText } from "./embed";
import { fillMissingHeadlines } from "../summarize/fillMissingHeadlines";

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !serviceKey || !geminiKey) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY must be set");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const result = await clusterUnclusteredArticles(supabase, (text) => embedText(text, geminiKey));
  console.log(`Created ${result.clustersCreated} stories from ${result.articlesClustered} articles.`);

  const headlineCount = await fillMissingHeadlines(supabase, geminiKey);
  console.log(`Generated headlines for ${headlineCount} stories.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
