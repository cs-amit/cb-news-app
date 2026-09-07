import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { embedText } from "../cluster/embed";
import { SIMILARITY_THRESHOLD_HIGH } from "../cluster/clusterStories";
import { searchNewsData } from "./newsDataClient";
import { findMoreSources } from "./findMoreSources";

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const newsDataKey = process.env.NEWSDATA_API_KEY;
  if (!supabaseUrl || !serviceKey || !geminiKey || !newsDataKey) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, and NEWSDATA_API_KEY must be set"
    );
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { checked, discovered } = await findMoreSources(
    supabase,
    (query) => searchNewsData(query, newsDataKey),
    (text) => embedText(text, geminiKey),
    SIMILARITY_THRESHOLD_HIGH
  );
  console.log(`Checked ${checked} stories, discovered ${discovered} new sources.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
