import { useEffect, useState } from "react";
import { FlatList, Text, Pressable, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { fetchRecentStories } from "../lib/queries";
import { Story } from "../lib/types";

export default function FeedScreen() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchRecentStories(supabase)
      .then(setStories)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (error) return <Text style={{ padding: 16 }}>Couldn't load stories: {error}</Text>;

  return (
    <FlatList
      data={stories}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <Pressable onPress={() => router.push("/methodology")} style={{ padding: 16 }}>
          <Text style={{ color: "#0066cc" }}>How are these badges calculated? Methodology →</Text>
        </Pressable>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/story/${item.id}`)}
          style={{ padding: 16, borderBottomWidth: 1, borderColor: "#eee" }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600" }}>
            {item.canonical_headline ?? "Untitled story"}
          </Text>
          {item.summary ? <Text style={{ marginTop: 4, color: "#555" }}>{item.summary}</Text> : null}
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={{ padding: 16 }}>
          <Text>No stories yet.</Text>
        </View>
      }
    />
  );
}
