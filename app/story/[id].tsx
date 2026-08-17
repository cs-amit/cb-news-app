import { useEffect, useState } from "react";
import { ScrollView, Text, ActivityIndicator, Linking, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import { fetchStoryWithArticles } from "../../lib/queries";
import { Story, ArticleWithOutlet } from "../../lib/types";

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [story, setStory] = useState<Story | null>(null);
  const [articles, setArticles] = useState<ArticleWithOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchStoryWithArticles(supabase, id)
      .then(({ story, articles }) => {
        setStory(story);
        setArticles(articles);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (error || !story) return <Text style={{ padding: 16 }}>Couldn't load story: {error}</Text>;

  return (
    <ScrollView style={{ padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>{story.canonical_headline}</Text>
      {story.summary ? <Text style={{ marginTop: 8, color: "#555" }}>{story.summary}</Text> : null}
      <Text style={{ marginTop: 24, fontWeight: "600" }}>Sources ({articles.length})</Text>
      {articles.map((article) => (
        <Pressable
          key={article.id}
          onPress={() => Linking.openURL(article.url)}
          style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: "#eee" }}
        >
          <Text style={{ fontWeight: "500" }}>{article.outlet?.name ?? "Unknown outlet"}</Text>
          <Text style={{ color: "#333" }}>{article.title}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
