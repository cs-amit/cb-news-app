import { SupabaseClient } from "@supabase/supabase-js";
import { detectConflicts, OutletOwnership } from "./detectConflicts";

// Rolling window matching UNCLUSTERED_WINDOW_HOURS in clusterStories.ts — a
// story's coverage can keep growing for a couple of days, so re-scan recently
// created stories rather than trying to catch every article the instant it's
// clustered. Upserting on (story_id, outlet_id, matched_entity) makes re-runs
// idempotent.
const CONFLICT_WINDOW_HOURS = 48;

// Page size for fetching the stories to re-scan. 500 is a reasonable page size
// chosen for this codebase — it is not tied to any platform default.
const STORY_PAGE_SIZE = 500;

// Hard safety ceiling across ALL pages combined. Not expected to be hit in
// normal operation — it exists so an unexpectedly large window (a story-
// creation spike, or a clustering bug producing runaway singleton stories)
// degrades to a loud warning instead of an unbounded fetch loop.
const STORY_SAFETY_CEILING = 5000;

export async function flagStoryConflicts(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - CONFLICT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  // Paginate rather than taking a single uncapped page: at observed production
  // volume (~222 stories in 4h) the 48h window is well over a thousand rows, so
  // an unpaginated fetch silently truncates at the server row cap and quietly
  // stops conflict-checking the oldest stories in the window.
  const stories: { id: string }[] = [];
  let offset = 0;
  while (true) {
    const { data: page, error } = await supabase
      .from("stories")
      .select("id")
      .gte("first_seen_at", cutoff)
      .order("first_seen_at", { ascending: false })
      // first_seen_at is not unique, so ties could otherwise be ordered
      // differently between page requests and skip/duplicate rows across
      // .range() boundaries. id breaks the tie deterministically.
      .order("id")
      .range(offset, offset + STORY_PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch stories for conflict check: ${error.message}`);

    stories.push(...(page ?? []));

    if ((page?.length ?? 0) < STORY_PAGE_SIZE) break;
    if (stories.length >= STORY_SAFETY_CEILING) {
      console.warn(
        `Conflict-check story set hit the ${STORY_SAFETY_CEILING}-row safety ceiling; ` +
          `older stories in the ${CONFLICT_WINDOW_HOURS}h window were not scanned. ` +
          `Investigate story volume growth.`
      );
      break;
    }
    offset += STORY_PAGE_SIZE;
  }

  let flagged = 0;
  for (const story of stories) {
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
