import { SupabaseClient } from "@supabase/supabase-js";
import { Story, ArticleWithOutlet, ConflictFlag } from "./types";
import { OutletSummary, computeSilentOutlets } from "./silence";
import { computeStreak, computeSidesSeenTotal, ViewRow } from "./streak";
import { PollResponseValue } from "./polls";

export async function fetchRecentStories(supabase: SupabaseClient): Promise<Story[]> {
  const { data, error } = await supabase
    .from("stories")
    .select("id, canonical_headline, summary, first_seen_at")
    // Only surface stories that already have a generated headline. Headline
    // generation is rate-limited (~20 Gemini requests/day), so headline-less
    // stories are created faster than they can be labelled; without this
    // filter the newest 50 stories are almost all "Untitled story".
    .not("canonical_headline", "is", null)
    .order("first_seen_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Failed to fetch stories: ${error.message}`);
  return data ?? [];
}

export async function fetchStoryWithArticles(
  supabase: SupabaseClient,
  storyId: string
): Promise<{ story: Story; articles: ArticleWithOutlet[] }> {
  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, canonical_headline, summary, first_seen_at")
    .eq("id", storyId)
    .single();
  if (storyError || !story) throw new Error(`Failed to fetch story: ${storyError?.message}`);

  const { data: articles, error: articlesError } = await supabase
    .from("articles")
    .select(
      "id, title, url, published_at, outlet:outlets(id, name, is_youtube, ownership, freedom_score, govt_lean_score, sensationalism_score, govt_lean_sample_size, govt_lean_updated_at)"
    )
    .eq("story_id", storyId)
    .order("published_at", { ascending: false });
  if (articlesError) throw new Error(`Failed to fetch articles: ${articlesError.message}`);

  return { story, articles: (articles ?? []) as unknown as ArticleWithOutlet[] };
}

const ACTIVE_OUTLET_WINDOW_DAYS = 7;

// Page size for scanning the trailing-window articles table for active outlets.
// 500 is a reasonable page size chosen for this codebase, not a platform default.
const ACTIVE_PAGE_SIZE = 500;

// Hard ceiling on total article rows scanned, even if some outlets still
// haven't been seen. This runs client-side on the phone, so an unbounded scan
// would be a real bandwidth/latency cost, not just a slow script.
const ACTIVE_SAFETY_CEILING = 5000;

export async function fetchSilentOutlets(
  supabase: SupabaseClient,
  storyId: string,
  storyFirstSeenAt: string
): Promise<OutletSummary[]> {
  const activeCutoff = new Date(
    Date.now() - ACTIVE_OUTLET_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Fetch the outlet list FIRST. The table is small and bounded (tens of rows),
  // and knowing the total up front lets the article scan below stop as soon as
  // every known outlet has been seen active.
  const { data: allOutlets, error: outletsError } = await supabase
    .from("outlets")
    .select("id, name, is_youtube");
  if (outletsError) throw new Error(`Failed to fetch outlet details: ${outletsError.message}`);
  const outlets = (allOutlets ?? []) as OutletSummary[];
  if (outlets.length === 0) return [];

  // Page through recent articles accumulating the set of outlets that have
  // published. An unpaginated fetch here both truncated silently at the server
  // row cap (dropping genuinely-active outlets, which then wrongly appear in
  // "not yet covered by") and pulled the whole trailing-7-day table down to the
  // device. The early exit below means that in the common case — most outlets
  // active — this terminates after one or two pages.
  const activeOutletIds = new Set<string>();
  let scanned = 0;
  let offset = 0;
  while (true) {
    const { data: page, error: activeError } = await supabase
      .from("articles")
      .select("outlet_id")
      .gte("created_at", activeCutoff)
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + ACTIVE_PAGE_SIZE - 1);
    if (activeError) throw new Error(`Failed to fetch active outlets: ${activeError.message}`);

    const rows = page ?? [];
    for (const row of rows as any[]) {
      if (row.outlet_id) activeOutletIds.add(row.outlet_id);
    }
    scanned += rows.length;

    // Every known outlet has already been seen active — nothing further can be
    // learned from more pages.
    if (activeOutletIds.size >= outlets.length) break;
    if (rows.length < ACTIVE_PAGE_SIZE) break;
    if (scanned >= ACTIVE_SAFETY_CEILING) {
      console.warn(
        `Active-outlet scan hit the ${ACTIVE_SAFETY_CEILING}-row safety ceiling; ` +
          `some outlets active in the trailing ${ACTIVE_OUTLET_WINDOW_DAYS} days may ` +
          `not have been counted.`
      );
      break;
    }
    offset += ACTIVE_PAGE_SIZE;
  }
  if (activeOutletIds.size === 0) return [];

  // No second outlets query needed: step 1 already returned every outlet's
  // details, so filtering in memory is strictly cheaper than a round trip.
  const activeOutlets = outlets.filter((o) => activeOutletIds.has(o.id));

  const { data: coveringArticles, error: coveringError } = await supabase
    .from("articles")
    .select("outlet_id")
    .eq("story_id", storyId);
  if (coveringError) throw new Error(`Failed to fetch covering outlets: ${coveringError.message}`);
  const coveringIds = new Set((coveringArticles ?? []).map((a: any) => a.outlet_id));

  return computeSilentOutlets(activeOutlets, coveringIds, storyFirstSeenAt);
}

export interface MethodologyStats {
  outletCount: number;
  youtubeCount: number;
  scoredOutletCount: number;
  lastScoredAt: string | null;
}

export async function fetchMethodologyStats(supabase: SupabaseClient): Promise<MethodologyStats> {
  const { data, error } = await supabase.from("outlets").select("is_youtube, govt_lean_updated_at");
  if (error) throw new Error(`Failed to fetch methodology stats: ${error.message}`);
  const rows = data ?? [];
  const scored = rows.filter((r: any) => r.govt_lean_updated_at);
  const lastScoredAt = scored.reduce(
    (latest: string | null, r: any) =>
      !latest || r.govt_lean_updated_at > latest ? r.govt_lean_updated_at : latest,
    null as string | null
  );
  return {
    outletCount: rows.filter((r: any) => !r.is_youtube).length,
    youtubeCount: rows.filter((r: any) => r.is_youtube).length,
    scoredOutletCount: scored.length,
    lastScoredAt,
  };
}

export async function fetchConflictFlags(
  supabase: SupabaseClient,
  storyId: string
): Promise<ConflictFlag[]> {
  const { data, error } = await supabase
    .from("story_conflict_flags")
    .select("outlet_id, matched_entity, evidence_text")
    .eq("story_id", storyId);
  if (error) throw new Error(`Failed to fetch conflict flags: ${error.message}`);
  return data ?? [];
}

export interface FactCheck {
  source_org: string;
  claim: string;
  verdict: string;
  url: string;
}

export async function fetchFactChecks(supabase: SupabaseClient, storyId: string): Promise<FactCheck[]> {
  const { data, error } = await supabase
    .from("fact_checks")
    .select("source_org, claim, verdict, url")
    .eq("matched_story_id", storyId);
  if (error) throw new Error(`Failed to fetch fact-checks: ${error.message}`);
  return data ?? [];
}

export interface Profile {
  id: string;
  streak_count: number;
  longest_streak: number;
  sides_seen_total: number;
  notification_opt_in: boolean;
  notification_hour: number;
  handle: string | null;
  compass_quiz_taken_at: string | null;
}

export async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, streak_count, longest_streak, sides_seen_total, notification_opt_in, notification_hour, handle, compass_quiz_taken_at"
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch profile: ${error.message}`);
  return data;
}

export async function claimHandle(supabase: SupabaseClient, userId: string, handle: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ handle }).eq("id", userId);
  if (error) throw new Error(`Failed to claim handle: ${error.message}`);
}

// Composes claimHandle + createDefaultRepostsList for the deferred-claim
// upgrade flow (app/index.tsx): the caller is responsible for only invoking
// this once the user's email is actually confirmed and for reading/clearing
// the AsyncStorage-backed pending handle (lib/handle.ts) around the call —
// this function itself stays a thin, order-guaranteed composition with no
// confirmation check or storage access of its own.
export async function completePendingHandleClaim(
  supabase: SupabaseClient,
  userId: string,
  pendingHandle: string
): Promise<void> {
  await claimHandle(supabase, userId, pendingHandle);
  await createDefaultRepostsList(supabase, userId);
}

export async function setCompassPosition(
  supabase: SupabaseClient,
  userId: string,
  position: number
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ compass_position: position, compass_quiz_taken_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw new Error(`Failed to save compass position: ${error.message}`);
}

export interface PublicProfile {
  id: string;
  handle: string;
  compass_position: number | null;
}

export async function fetchPublicProfile(
  supabase: SupabaseClient,
  handle: string
): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, handle, compass_position")
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch profile: ${error.message}`);
  return data;
}

export async function fetchListById(supabase: SupabaseClient, listId: string): Promise<ListRow | null> {
  const { data, error } = await supabase.from("lists").select("*").eq("id", listId).maybeSingle();
  if (error) throw new Error(`Failed to fetch list: ${error.message}`);
  return data;
}

export async function recordArticleView(
  supabase: SupabaseClient,
  userId: string,
  storyId: string,
  outletId: string
): Promise<void> {
  const { error } = await supabase
    .from("user_story_views")
    .upsert(
      { user_id: userId, story_id: storyId, outlet_id: outletId },
      { onConflict: "user_id,story_id,outlet_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(`Failed to record article view: ${error.message}`);
}

// A per-user window, not the global-table pagination Task 1 deals with — a
// single reader's view history over 60 days stays small (dozens to low
// hundreds of rows), so no ceiling/pagination is needed here.
const VIEW_HISTORY_WINDOW_DAYS = 60;

export async function recomputeAndSaveStreak(
  supabase: SupabaseClient,
  userId: string,
  computeStreakFn: (rows: ViewRow[], now: Date) => number = computeStreak
): Promise<{ streakCount: number; sidesSeenTotal: number }> {
  const cutoff = new Date(
    Date.now() - VIEW_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data, error } = await supabase
    .from("user_story_views")
    .select("story_id, outlet_id, viewed_at")
    .eq("user_id", userId)
    .gte("viewed_at", cutoff);
  if (error) throw new Error(`Failed to fetch view history: ${error.message}`);
  const rows = (data ?? []) as ViewRow[];

  const streakCount = computeStreakFn(rows, new Date());
  const sidesSeenTotal = computeSidesSeenTotal(rows);

  const profile = await fetchProfile(supabase, userId);
  const longestStreak = Math.max(profile?.longest_streak ?? 0, streakCount);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ streak_count: streakCount, longest_streak: longestStreak, sides_seen_total: sidesSeenTotal })
    .eq("id", userId);
  if (updateError) throw new Error(`Failed to save streak: ${updateError.message}`);

  return { streakCount, sidesSeenTotal };
}

export async function submitPollResponse(
  supabase: SupabaseClient,
  userId: string,
  storyId: string,
  outletId: string,
  response: PollResponseValue
): Promise<void> {
  const { error } = await supabase
    .from("outlet_poll_responses")
    .upsert(
      { user_id: userId, story_id: storyId, outlet_id: outletId, response },
      { onConflict: "user_id,story_id,outlet_id" }
    );
  if (error) throw new Error(`Failed to submit poll response: ${error.message}`);
}

export interface PollTally {
  critical: number;
  balanced: number;
  friendly: number;
  total: number;
}

export async function fetchPollTally(
  supabase: SupabaseClient,
  storyId: string,
  outletId: string
): Promise<PollTally> {
  const { data, error } = await supabase
    .from("outlet_poll_tallies")
    .select("response, response_count")
    .eq("story_id", storyId)
    .eq("outlet_id", outletId);
  if (error) throw new Error(`Failed to fetch poll tally: ${error.message}`);

  const tally: PollTally = { critical: 0, balanced: 0, friendly: 0, total: 0 };
  for (const row of (data ?? []) as { response: PollResponseValue; response_count: number }[]) {
    tally[row.response] = row.response_count;
    tally.total += row.response_count;
  }
  return tally;
}

// Tallies for every outlet on a story in one query, rather than one
// fetchPollTally call per outlet — the same query shape as fetchPollTally
// with the outlet_id filter dropped, grouped client-side instead. This is
// what lets the Story screen show "X% of readers said balanced" for every
// eligible outlet as soon as the screen loads, not just after the current
// viewer submits their own vote in this session.
export async function fetchPollTallies(
  supabase: SupabaseClient,
  storyId: string
): Promise<Record<string, PollTally>> {
  const { data, error } = await supabase
    .from("outlet_poll_tallies")
    .select("outlet_id, response, response_count")
    .eq("story_id", storyId);
  if (error) throw new Error(`Failed to fetch poll tallies: ${error.message}`);

  const tallies: Record<string, PollTally> = {};
  for (const row of (data ?? []) as {
    outlet_id: string;
    response: PollResponseValue;
    response_count: number;
  }[]) {
    if (!tallies[row.outlet_id]) {
      tallies[row.outlet_id] = { critical: 0, balanced: 0, friendly: 0, total: 0 };
    }
    tallies[row.outlet_id][row.response] = row.response_count;
    tallies[row.outlet_id].total += row.response_count;
  }
  return tallies;
}

export interface ListRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  is_default: boolean;
  created_at: string;
}

export interface ListItemRow {
  id: string;
  list_id: string;
  story_id: string;
  position: number;
  added_at: string;
  story?: Story;
}

export async function createDefaultRepostsList(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("lists")
    .insert({ owner_id: userId, name: "Reposts", is_public: true, is_default: true })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create default list: ${error?.message}`);
  return data.id;
}

export async function createList(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  description: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from("lists")
    .insert({ owner_id: userId, name, description, is_public: false, is_default: false })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create list: ${error?.message}`);
  return data.id;
}

export async function fetchUserLists(supabase: SupabaseClient, userId: string): Promise<ListRow[]> {
  const { data, error } = await supabase
    .from("lists")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at");
  if (error) throw new Error(`Failed to fetch lists: ${error.message}`);
  return data ?? [];
}

export async function fetchPublicLists(supabase: SupabaseClient, ownerId: string): Promise<ListRow[]> {
  const { data, error } = await supabase
    .from("lists")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_public", true)
    .order("created_at");
  if (error) throw new Error(`Failed to fetch public lists: ${error.message}`);
  return data ?? [];
}

export async function fetchListItems(supabase: SupabaseClient, listId: string): Promise<ListItemRow[]> {
  const { data, error } = await supabase
    .from("list_items")
    .select("id, list_id, story_id, position, added_at, story:stories(id, canonical_headline, summary, first_seen_at)")
    .eq("list_id", listId)
    .order("position");
  if (error) throw new Error(`Failed to fetch list items: ${error.message}`);
  return (data ?? []) as unknown as ListItemRow[];
}

export async function addStoryToList(supabase: SupabaseClient, listId: string, storyId: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1);
  if (fetchError) throw new Error(`Failed to check list items: ${fetchError.message}`);
  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;
  const { error } = await supabase
    .from("list_items")
    .upsert(
      { list_id: listId, story_id: storyId, position: nextPosition },
      { onConflict: "list_id,story_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(`Failed to add story to list: ${error.message}`);
}

export async function removeStoryFromList(supabase: SupabaseClient, listId: string, storyId: string): Promise<void> {
  const { error } = await supabase.from("list_items").delete().eq("list_id", listId).eq("story_id", storyId);
  if (error) throw new Error(`Failed to remove story from list: ${error.message}`);
}

export async function toggleListPublic(supabase: SupabaseClient, listId: string, isPublic: boolean): Promise<void> {
  const { error } = await supabase.from("lists").update({ is_public: isPublic }).eq("id", listId);
  if (error) throw new Error(`Failed to update list visibility: ${error.message}`);
}

export async function reorderListItems(
  supabase: SupabaseClient,
  updates: { id: string; position: number }[]
): Promise<void> {
  for (const update of updates) {
    const { error } = await supabase.from("list_items").update({ position: update.position }).eq("id", update.id);
    if (error) throw new Error(`Failed to reorder list item ${update.id}: ${error.message}`);
  }
}
