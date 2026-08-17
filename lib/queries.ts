import { SupabaseClient } from "@supabase/supabase-js";
import { Story, ArticleWithOutlet } from "./types";

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
    .select("id, title, url, published_at, outlet:outlets(id, name)")
    .eq("story_id", storyId)
    .order("published_at", { ascending: false });
  if (articlesError) throw new Error(`Failed to fetch articles: ${articlesError.message}`);

  return { story, articles: (articles ?? []) as unknown as ArticleWithOutlet[] };
}
