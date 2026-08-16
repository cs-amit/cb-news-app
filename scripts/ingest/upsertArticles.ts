import { SupabaseClient } from "@supabase/supabase-js";
import { FeedItem } from "./fetchFeeds";

export async function upsertArticles(
  supabase: SupabaseClient,
  outletId: string,
  items: FeedItem[]
): Promise<number> {
  if (items.length === 0) return 0;
  const rows = items.map((item) => ({
    outlet_id: outletId,
    title: item.title,
    url: item.url,
    snippet: item.snippet,
    published_at: item.publishedAt,
  }));
  const { error, count } = await supabase
    .from("articles")
    .upsert(rows, { onConflict: "url", ignoreDuplicates: true, count: "exact" });
  if (error) throw new Error(`Failed to upsert articles: ${error.message}`);
  return count ?? 0;
}
