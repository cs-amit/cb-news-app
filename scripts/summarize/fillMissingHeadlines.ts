import { SupabaseClient } from "@supabase/supabase-js";
import { generateStoryHeadline } from "./generateStoryHeadline";

// The Gemini free tier allows roughly 20 generation requests/day, while the
// 2-hourly cron creates headline-less stories far faster than that. Cap each
// run and spend the scarce quota on the NEWEST headline-less stories — those
// are the ones the feed (which only shows stories that have a headline) will
// want to display next. Processing oldest-first meant the feed's newest 50
// were permanently unlabelled.
const MAX_STORIES_PER_RUN = 15;

export async function fillMissingHeadlines(
  supabase: SupabaseClient,
  apiKey: string
): Promise<number> {
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id")
    .is("canonical_headline", null)
    .order("first_seen_at", { ascending: false })
    .limit(MAX_STORIES_PER_RUN);
  if (error) throw new Error(`Failed to fetch stories needing headlines: ${error.message}`);

  let updated = 0;
  for (const story of stories ?? []) {
    const { data: articles, error: articlesError } = await supabase
      .from("articles")
      .select("title, outlet:outlets(name)")
      .eq("story_id", story.id);
    if (articlesError || !articles || articles.length === 0) continue;

    // Quota exhaustion mid-run is the NORMAL case, not a failure of the job.
    // Letting it propagate made run.ts exit(1) on nearly every cron tick,
    // which made a genuine outage indistinguishable from routine throttling.
    let headline: string;
    let summary: string;
    try {
      ({ headline, summary } = await generateStoryHeadline(
        articles.map((a: any) => ({ title: a.title, outletName: a.outlet?.name ?? "Unknown" })),
        apiKey
      ));
    } catch (err) {
      console.error(
        `Failed to generate headline for story ${story.id}:`,
        err instanceof Error ? err.message : err
      );
      continue;
    }

    const { error: updateError } = await supabase
      .from("stories")
      .update({ canonical_headline: headline, summary })
      .eq("id", story.id);
    if (updateError) {
      console.error(`Failed to save headline for story ${story.id}: ${updateError.message}`);
      continue;
    }
    updated += 1;
  }
  return updated;
}
