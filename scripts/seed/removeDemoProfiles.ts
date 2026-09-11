import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// Every FK that points at auth.users(id) in this schema (profiles,
// user_story_views, outlet_poll_responses, lists -> list_items) is ON
// DELETE CASCADE -- checked directly against the migrations before writing
// this, same homework as every other delete in this project. Deleting the
// demo auth users is therefore sufficient: everything seeded by
// seedDemoProfiles.ts cascades away with it, and nothing else references a
// demo profile (is_demo rows were never used as real merge targets or
// linked from anywhere outside their own rows).
async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: demoProfiles, error } = await supabase.from("profiles").select("id, handle").eq("is_demo", true);
  if (error) throw new Error(`Failed to fetch demo profiles: ${error.message}`);
  if (!demoProfiles || demoProfiles.length === 0) {
    console.log("No demo profiles found -- nothing to remove.");
    return;
  }

  for (const profile of demoProfiles) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(profile.id);
    if (deleteError) {
      throw new Error(`Failed to delete demo user ${profile.handle} (${profile.id}): ${deleteError.message}`);
    }
    console.log(`Removed ${profile.handle}.`);
  }

  console.log(`Done: removed ${demoProfiles.length} demo profile(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Demo profile removal failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
