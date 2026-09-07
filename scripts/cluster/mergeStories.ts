import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reassigns rows in `table` from any of `loserStoryIds` to `winnerStoryId`,
 * but `table` has a UNIQUE constraint over (storyColumn, ...otherKeyColumns)
 * -- a straight UPDATE can collide with a row the winner (or another loser
 * already reassigned this call) already has for the same other-key
 * combination. When it would, the loser's row is a genuine duplicate of
 * something the winner already records, so it's deleted instead of
 * reassigned.
 */
async function reassignWithDedupe(
  supabase: SupabaseClient,
  table: string,
  storyColumn: string,
  otherKeyColumns: string[],
  loserStoryIds: string[],
  winnerStoryId: string
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select(["id", storyColumn, ...otherKeyColumns].join(", "))
    .in(storyColumn, [...loserStoryIds, winnerStoryId]);
  if (error) throw new Error(`Failed to fetch ${table} for merge: ${error.message}`);

  const rows = (data ?? []) as Record<string, any>[];
  const keyOf = (row: Record<string, any>) => otherKeyColumns.map((c) => row[c]).join("|");
  const winnerKeys = new Set(rows.filter((r) => r[storyColumn] === winnerStoryId).map(keyOf));
  const loserRows = rows.filter((r) => r[storyColumn] !== winnerStoryId);

  for (const row of loserRows) {
    const key = keyOf(row);
    if (winnerKeys.has(key)) {
      const { error: delErr } = await supabase.from(table).delete().eq("id", row.id);
      if (delErr) throw new Error(`Failed to delete duplicate ${table} row ${row.id}: ${delErr.message}`);
    } else {
      const { error: updErr } = await supabase
        .from(table)
        .update({ [storyColumn]: winnerStoryId })
        .eq("id", row.id);
      if (updErr) throw new Error(`Failed to reassign ${table} row ${row.id}: ${updErr.message}`);
      winnerKeys.add(key);
    }
  }
}

/**
 * Merges `loserStoryIds` into `winnerStoryId`: every article, conflict flag,
 * saved list item, poll response, and fact-check link currently pointing at
 * a loser is repointed to the winner (deduping where a unique constraint
 * would otherwise collide), then the now-empty loser story rows are
 * deleted. `outlet_poll_tallies` is a GROUP BY view over
 * outlet_poll_responses, not a real table -- it recomputes automatically
 * once the responses underneath it move, so it needs no handling here.
 *
 * Deletes last, after every reassignment: a run that fails partway leaves
 * loser stories with zero articles (harmless, re-mergeable next time)
 * rather than a deleted story some other table still points at.
 */
export async function mergeStories(
  supabase: SupabaseClient,
  loserStoryIds: string[],
  winnerStoryId: string
): Promise<void> {
  if (loserStoryIds.length === 0) return;

  await reassignWithDedupe(
    supabase,
    "story_conflict_flags",
    "story_id",
    ["outlet_id", "matched_entity"],
    loserStoryIds,
    winnerStoryId
  );
  await reassignWithDedupe(
    supabase,
    "user_story_views",
    "story_id",
    ["user_id", "outlet_id"],
    loserStoryIds,
    winnerStoryId
  );
  await reassignWithDedupe(
    supabase,
    "outlet_poll_responses",
    "story_id",
    ["user_id", "outlet_id"],
    loserStoryIds,
    winnerStoryId
  );
  await reassignWithDedupe(supabase, "list_items", "story_id", ["list_id"], loserStoryIds, winnerStoryId);

  const { error: fcError } = await supabase
    .from("fact_checks")
    .update({ matched_story_id: winnerStoryId })
    .in("matched_story_id", loserStoryIds);
  if (fcError) throw new Error(`Failed to reassign fact_checks: ${fcError.message}`);

  const { error: articlesError } = await supabase
    .from("articles")
    .update({ story_id: winnerStoryId })
    .in("story_id", loserStoryIds);
  if (articlesError) throw new Error(`Failed to reassign articles: ${articlesError.message}`);

  // discovered_articles.url is globally unique (not per-story), so a loser's
  // and winner's rows can never collide the way the dedupe-tracked tables
  // above can -- a direct reassignment is enough, same as fact_checks/articles.
  const { error: discoveredError } = await supabase
    .from("discovered_articles")
    .update({ story_id: winnerStoryId })
    .in("story_id", loserStoryIds);
  if (discoveredError) throw new Error(`Failed to reassign discovered_articles: ${discoveredError.message}`);

  const { error: deleteError } = await supabase.from("stories").delete().in("id", loserStoryIds);
  if (deleteError) throw new Error(`Failed to delete merged stories: ${deleteError.message}`);
}
