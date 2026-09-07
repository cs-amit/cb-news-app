import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// A recurring discovered outlet is a candidate for manual curation into the
// real outlets table (with real ownership research + a scoring sample) -- not
// something this feature promotes on its own. Run manually, not on a cron.
const RECURRING_THRESHOLD = 3;

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase.from("discovered_articles").select("outlet_name, story_id");
  if (error) throw new Error(`Failed to fetch discovered_articles: ${error.message}`);

  const storyIdsByOutlet = new Map<string, Set<string>>();
  for (const row of (data ?? []) as { outlet_name: string; story_id: string }[]) {
    const set = storyIdsByOutlet.get(row.outlet_name) ?? new Set<string>();
    set.add(row.story_id);
    storyIdsByOutlet.set(row.outlet_name, set);
  }

  const recurring = [...storyIdsByOutlet.entries()]
    .map(([outletName, storyIds]) => ({ outletName, storyCount: storyIds.size }))
    .filter((r) => r.storyCount >= RECURRING_THRESHOLD)
    .sort((a, b) => b.storyCount - a.storyCount);

  if (recurring.length === 0) {
    console.log(`No discovered outlet has recurred across ${RECURRING_THRESHOLD}+ stories yet.`);
    return;
  }
  console.log(`Discovered outlets recurring across ${RECURRING_THRESHOLD}+ stories (candidates for manual curation):`);
  for (const r of recurring) {
    console.log(`  ${r.outletName}: ${r.storyCount} stories`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
