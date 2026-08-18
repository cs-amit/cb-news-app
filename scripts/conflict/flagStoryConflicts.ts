import { SupabaseClient } from "@supabase/supabase-js";
import { detectConflicts, OutletOwnership } from "./detectConflicts";

// Rolling window matching UNCLUSTERED_WINDOW_HOURS in clusterStories.ts — a
// story's coverage can keep growing for a couple of days, so re-scan recently
// created stories rather than trying to catch every article the instant it's
// clustered. Upserting on (story_id, outlet_id, matched_entity) makes re-runs
// idempotent.
const CONFLICT_WINDOW_HOURS = 48;

export async function flagStoryConflicts(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - CONFLICT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id")
    .gte("first_seen_at", cutoff);
  if (error) throw new Error(`Failed to fetch stories for conflict check: ${error.message}`);

  let flagged = 0;
  for (const story of stories ?? []) {
    const { data: articles, error: articlesError } = await supabase
      .from("articles")
      .select("title, snippet, outlet:outlets(id, ownership)")
      .eq("story_id", story.id);
    if (articlesError || !articles || articles.length === 0) continue;

    const storyText = articles.map((a: any) => `${a.title} ${a.snippet ?? ""}`).join(" ");
    const seenOutlets = new Map<string, OutletOwnership | null>();
    for (const a of articles as any[]) {
      if (a.outlet?.id) seenOutlets.set(a.outlet.id, a.outlet.ownership ?? null);
    }
    const coveringOutlets = [...seenOutlets.entries()].map(([outletId, ownership]) => ({
      outletId,
      ownership,
    }));

    const flags = detectConflicts(storyText, coveringOutlets);
    if (flags.length === 0) continue;

    const rows = flags.map((f) => ({
      story_id: story.id,
      outlet_id: f.outletId,
      matched_entity: f.matchedEntity,
      evidence_text: f.evidenceText,
    }));
    const { error: upsertError } = await supabase
      .from("story_conflict_flags")
      .upsert(rows, { onConflict: "story_id,outlet_id,matched_entity" });
    if (upsertError) {
      console.error(`Failed to save conflict flags for story ${story.id}: ${upsertError.message}`);
      continue;
    }
    flagged += flags.length;
  }
  return flagged;
}
