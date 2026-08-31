import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { fetchFeed, dedupeByUrl } from "./fetchFeeds";
import { upsertArticles } from "./upsertArticles";

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: outletRows, error } = await supabase.from("outlets").select("id, rss_url");
  if (error) throw new Error(`Failed to load outlets: ${error.message}`);

  let total = 0;
  for (const outlet of outletRows ?? []) {
    try {
      const items = dedupeByUrl(await fetchFeed(outlet.rss_url));
      const count = await upsertArticles(supabase, outlet.id, items);
      total += count;
      console.log(`Ingested ${count} new articles from ${outlet.rss_url}`);
    } catch (err) {
      console.error(`Failed to ingest ${outlet.rss_url}:`, err);
    }
  }
  console.log(`Done. ${total} new articles ingested.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
