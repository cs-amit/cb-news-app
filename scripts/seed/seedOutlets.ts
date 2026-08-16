import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import outlets from "../../supabase/seed/outlets.json";

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { error, count } = await supabase
    .from("outlets")
    .upsert(outlets, { onConflict: "rss_url", count: "exact" });
  if (error) throw new Error(`Failed to seed outlets: ${error.message}`);
  console.log(`Seeded ${count ?? outlets.length} outlets.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
