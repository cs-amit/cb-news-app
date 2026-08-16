import { SupabaseClient } from "@supabase/supabase-js";
import { generateStoryHeadline } from "./generateStoryHeadline";

export async function fillMissingHeadlines(
  supabase: SupabaseClient,
  apiKey: string
): Promise<number> {
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id")
    .is("canonical_headline", null);
  if (error) throw new Error(`Failed to fetch stories needing headlines: ${error.message}`);

  let updated = 0;
  for (const story of stories ?? []) {
    const { data: articles, error: articlesError } = await supabase
      .from("articles")
      .select("title, outlet:outlets(name)")
      .eq("story_id", story.id);
    if (articlesError || !articles || articles.length === 0) continue;

    const { headline, summary } = await generateStoryHeadline(
      articles.map((a: any) => ({ title: a.title, outletName: a.outlet?.name ?? "Unknown" })),
      apiKey
    );
    const { error: updateError } = await supabase
      .from("stories")
      .update({ canonical_headline: headline, summary })
      .eq("id", story.id);
    if (!updateError) updated += 1;
  }
  return updated;
}
