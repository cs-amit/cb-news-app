import { SupabaseClient } from "@supabase/supabase-js";
import { clusterBySimilarity, EmbeddedArticle } from "./similarity";

const SIMILARITY_THRESHOLD = 0.86;

interface UnclusteredArticle {
  id: string;
  title: string;
  snippet: string | null;
}

export async function clusterUnclusteredArticles(
  supabase: SupabaseClient,
  embedFn: (text: string) => Promise<number[]>
): Promise<{ clustersCreated: number; articlesClustered: number }> {
  const { data: articles, error } = await supabase
    .from("articles")
    .select("id, title, snippet")
    .is("story_id", null)
    .gte("published_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

  if (error) throw new Error(`Failed to fetch unclustered articles: ${error.message}`);
  if (!articles || articles.length === 0) {
    return { clustersCreated: 0, articlesClustered: 0 };
  }

  const embedded: EmbeddedArticle[] = [];
  for (const article of articles as UnclusteredArticle[]) {
    const embedding = await embedFn(`${article.title}\n${article.snippet ?? ""}`);
    embedded.push({ id: article.id, embedding });
    await supabase.from("articles").update({ embedding }).eq("id", article.id);
  }

  const clusters = clusterBySimilarity(embedded, SIMILARITY_THRESHOLD);

  let clustersCreated = 0;
  let articlesClustered = 0;
  for (const cluster of clusters) {
    const { data: story, error: storyError } = await supabase
      .from("stories")
      .insert({})
      .select("id")
      .single();
    if (storyError || !story) {
      throw new Error(`Failed to create story: ${storyError?.message}`);
    }
    const { error: updateError } = await supabase
      .from("articles")
      .update({ story_id: story.id })
      .in("id", cluster.articleIds);
    if (updateError) {
      throw new Error(`Failed to assign articles to story: ${updateError.message}`);
    }
    clustersCreated += 1;
    articlesClustered += cluster.articleIds.length;
  }

  return { clustersCreated, articlesClustered };
}
