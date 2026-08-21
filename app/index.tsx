import { useEffect, useState } from "react";
import { FlatList, Text, Pressable, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import { fetchRecentStories, fetchProfile, Profile } from "../lib/queries";
import { Story } from "../lib/types";

export default function FeedScreen() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchRecentStories(supabase)
      .then(setStories)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getUserId(supabase)
      .then((userId) => fetchProfile(supabase, userId))
      .then(setProfile)
      // Streak display is a nice-to-have on top of the core feed — a
      // failure here must never block or error the feed itself.
      .catch((err) => console.error("Failed to load profile:", err));
  }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (error) return <Text style={{ padding: 16 }}>Couldn't load stories: {error}</Text>;

  return (
    <FlatList
      data={stories}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          {profile && profile.streak_count > 0 ? (
            <Text style={{ padding: 16, paddingBottom: 0, fontWeight: "600" }}>
              {profile.streak_count}-day streak · {profile.sides_seen_total} sides seen
            </Text>
          ) : null}
          <Pressable onPress={() => router.push("/methodology")} style={{ padding: 16 }}>
            <Text style={{ color: "#0066cc" }}>How are these badges calculated? Methodology →</Text>
          </Pressable>
        </View>
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
