import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { fetchFeed, dedupeByUrl } from "../ingest/fetchFeeds";
import { embedText } from "../cluster/embed";
import { classifyVerdict } from "./classifyVerdict";
import { matchFactChecksToStories } from "./matchFactChecks";
import sources from "../../supabase/seed/factCheckSources.json";

const MATCH_SIMILARITY_THRESHOLD = 0.82;

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !serviceKey || !geminiKey) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY must be set");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let ingested = 0;
  for (const source of sources) {
    try {
      const items = dedupeByUrl(await fetchFeed(source.rss_url));
      const rows = items.map((item) => ({
        source_org: source.name,
        claim: item.title,
        verdict: classifyVerdict(item.title),
        url: item.url,
        published_at: item.publishedAt,
      }));
      if (rows.length === 0) continue;
      const { error, count } = await supabase
        .from("fact_checks")
        .upsert(rows, { onConflict: "url", ignoreDuplicates: true, count: "exact" });
      if (error) throw new Error(error.message);
      ingested += count ?? 0;
      console.log(`Ingested ${count ?? 0} fact-checks from ${source.name}`);
    } catch (err) {
      console.error(`Failed to ingest ${source.name}:`, err);
    }
  }
  console.log(`Done ingesting. ${ingested} new fact-checks.`);

  const matched = await matchFactChecksToStories(
    supabase,
    (text) => embedText(text, geminiKey),
    MATCH_SIMILARITY_THRESHOLD
  );
  console.log(`Matched ${matched} fact-checks to stories.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
