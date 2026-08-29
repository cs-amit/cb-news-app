import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getUserId } from "../../lib/auth";
import {
  fetchPublicProfile,
  fetchPublicLists,
  fetchUserLists,
  PublicProfile,
  ListRow,
} from "../../lib/queries";

export default function ProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) return;
    (async () => {
      try {
        const found = await fetchPublicProfile(supabase, handle);
        if (!found) {
          setError("No profile with that handle.");
          setLoading(false);
          return;
        }
        setProfile(found);

        const userId = await getUserId(supabase);
        const own = userId === found.id;
        setIsOwnProfile(own);

        const visibleLists = own
          ? await fetchUserLists(supabase, found.id)
          : await fetchPublicLists(supabase, found.id);
        setLists(visibleLists);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [handle]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (error || !profile) return <Text style={{ padding: 16 }}>{error ?? "Profile not found."}</Text>;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>@{profile.handle}</Text>
      {profile.compass_position !== null ? (
        <Text style={{ marginTop: 4, color: "#555" }}>
          Compass position: {Math.round(profile.compass_position)}
        </Text>
      ) : null}
      {isOwnProfile ? (
        <Pressable onPress={() => router.push("/quiz")} style={{ marginTop: 8 }}>
          <Text style={{ color: "#0066cc" }}>Retake the quiz →</Text>
        </Pressable>
      ) : null}
      <Text style={{ marginTop: 20, fontWeight: "600" }}>
        {isOwnProfile ? "Your lists" : "Public lists"}
      </Text>
      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/list/${item.id}`)}
            style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee" }}
          >
            <Text style={{ fontWeight: "500" }}>{item.name}</Text>
            {item.description ? <Text style={{ color: "#777" }}>{item.description}</Text> : null}
            {!item.is_public ? <Text style={{ fontSize: 11, color: "#a00" }}>Private</Text> : null}
          </Pressable>
        )}
        ListEmptyComponent={<Text style={{ color: "#777", marginTop: 8 }}>No lists yet.</Text>}
      />
    </View>
  );
}
