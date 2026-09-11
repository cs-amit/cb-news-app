import "dotenv/config";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { DEMO_PERSONAS, buildPersonaListPlan } from "./demoPersonas";

const STORIES_PER_PERSONA = 3;

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // Curate from real, already-live multi-source stories -- only the
  // profiles/lists are fake, the news itself is real prod content.
  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("id")
    .not("canonical_headline", "is", null)
    .gte("article_count", 2)
    .order("first_seen_at", { ascending: false })
    .limit(DEMO_PERSONAS.length * STORIES_PER_PERSONA);
  if (storiesError) throw new Error(`Failed to fetch stories to curate: ${storiesError.message}`);

  const plan = buildPersonaListPlan(
    (stories ?? []).map((s) => s.id as string),
    DEMO_PERSONAS,
    STORIES_PER_PERSONA
  );

  for (const { persona, storyIds } of plan) {
    // Idempotent: re-running this script shouldn't create duplicate users.
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("handle", persona.handle)
      .maybeSingle();

    let userId = existing?.id as string | undefined;
    if (!userId) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: `${persona.handle}@demo.sourced.internal`,
        password: randomUUID(),
        email_confirm: true,
      });
      if (createError || !created.user) {
        throw new Error(`Failed to create demo auth user for ${persona.handle}: ${createError?.message}`);
      }
      userId = created.user.id;
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      handle: persona.handle,
      compass_position: persona.compassPosition,
      compass_public: true,
      is_demo: true,
    });
    if (profileError) throw new Error(`Failed to upsert demo profile ${persona.handle}: ${profileError.message}`);

    const { data: existingList } = await supabase
      .from("lists")
      .select("id")
      .eq("owner_id", userId)
      .eq("name", persona.listName)
      .maybeSingle();

    let listId = existingList?.id as string | undefined;
    if (!listId) {
      const { data: createdList, error: listError } = await supabase
        .from("lists")
        .insert({ owner_id: userId, name: persona.listName, is_public: true, is_default: false })
        .select("id")
        .single();
      if (listError || !createdList) {
        throw new Error(`Failed to create demo list for ${persona.handle}: ${listError?.message}`);
      }
      listId = createdList.id;
    } else {
      // Re-running the script shouldn't duplicate items on an existing list.
      await supabase.from("list_items").delete().eq("list_id", listId);
    }

    if (storyIds.length > 0) {
      const { error: itemsError } = await supabase.from("list_items").insert(
        storyIds.map((storyId, position) => ({ list_id: listId, story_id: storyId, position }))
      );
      if (itemsError) throw new Error(`Failed to seed list items for ${persona.handle}: ${itemsError.message}`);
    }

    console.log(`Seeded ${persona.handle} (${storyIds.length} curated stories).`);
  }

  console.log(`Done: ${plan.length} demo profile(s) seeded.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Demo profile seeding failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
