import { SupabaseClient } from "@supabase/supabase-js";
import { Story, ArticleWithOutlet } from "./types";
import { OutletSummary, computeSilentOutlets } from "./silence";

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

const ACTIVE_OUTLET_WINDOW_DAYS = 7;

export async function fetchSilentOutlets(
  supabase: SupabaseClient,
  storyId: string,
  storyFirstSeenAt: string
): Promise<OutletSummary[]> {
  const activeCutoff = new Date(
    Date.now() - ACTIVE_OUTLET_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: activeArticles, error: activeError } = await supabase
    .from("articles")
    .select("outlet_id")
    .gte("created_at", activeCutoff);
  if (activeError) throw new Error(`Failed to fetch active outlets: ${activeError.message}`);
  const activeOutletIds = [...new Set((activeArticles ?? []).map((a: any) => a.outlet_id))];
  if (activeOutletIds.length === 0) return [];

  const { data: activeOutlets, error: outletsError } = await supabase
    .from("outlets")
    .select("id, name, is_youtube")
    .in("id", activeOutletIds);
  if (outletsError) throw new Error(`Failed to fetch outlet details: ${outletsError.message}`);

  const { data: coveringArticles, error: coveringError } = await supabase
    .from("articles")
    .select("outlet_id")
    .eq("story_id", storyId);
  if (coveringError) throw new Error(`Failed to fetch covering outlets: ${coveringError.message}`);
  const coveringIds = new Set((coveringArticles ?? []).map((a: any) => a.outlet_id));

  return computeSilentOutlets((activeOutlets ?? []) as OutletSummary[], coveringIds, storyFirstSeenAt);
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
