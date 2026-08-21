import { useEffect, useState } from "react";
import { FlatList, Text, Pressable, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import { fetchRecentStories, fetchProfile, Profile } from "../lib/queries";
import { Story } from "../lib/types";
import {
  requestNotificationPermission,
  ensureAndroidChannel,
  scheduleDailyDigest,
} from "../lib/notifications";
import { buildDailyDigestCopy } from "../lib/notificationCopy";

const NOTIFICATION_PROMPT_DISMISSED_KEY = "notificationPromptDismissed";

export default function FeedScreen() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchRecentStories(supabase)
      .then(setStories)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getUserId(supabase)
      .then(async (id) => {
        setUserId(id);
        const p = await fetchProfile(supabase, id);
        setProfile(p);

        if (p?.notification_opt_in) {
          // Already opted in: keep the notification's content fresh every
          // time the app is opened, since there is no server push to do
          // this in the background.
          rescheduleDigest(p.notification_hour);
        } else if (p && p.streak_count >= 1) {
          const dismissed = await AsyncStorage.getItem(NOTIFICATION_PROMPT_DISMISSED_KEY);
          if (!dismissed) setShowNotificationPrompt(true);
        }
      })
      // Streak display is a nice-to-have on top of the core feed — a
      // failure here must never block or error the feed itself.
      .catch((err) => console.error("Failed to load profile:", err));
  }, []);

  async function rescheduleDigest(hour: number) {
    try {
      const recent = await fetchRecentStories(supabase);
      if (recent.length === 0) return;
      const top = recent[0];
      const content = buildDailyDigestCopy({
        topStoryHeadline: top.canonical_headline ?? "Today's top story",
        // Feed-level stats only — not a per-story source/silence fetch,
        // to keep this cheap on every app open. "1" is a conservative
        // floor since the story is on the feed at all (≥1 source exists).
        sourceCount: 1,
        silentCount: 0,
      });
      await scheduleDailyDigest(content, hour);
    } catch (err) {
      console.error("Failed to reschedule daily digest:", err);
    }
  }

  async function handleEnableNotifications() {
    setShowNotificationPrompt(false);
    const granted = await requestNotificationPermission();
    if (!granted || !userId) return;
    await ensureAndroidChannel();
    const { error } = await supabase
      .from("profiles")
      .update({ notification_opt_in: true })
      .eq("id", userId);
    if (error) {
      console.error("Failed to save notification opt-in:", error.message);
      return;
    }
    setProfile((prev) => (prev ? { ...prev, notification_opt_in: true } : prev));
    rescheduleDigest(9);
  }

  async function handleDismissNotificationPrompt() {
    setShowNotificationPrompt(false);
    await AsyncStorage.setItem(NOTIFICATION_PROMPT_DISMISSED_KEY, "true");
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (error) return <Text style={{ padding: 16 }}>Couldn't load stories: {error}</Text>;

  return (
    <FlatList
      data={stories}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          {showNotificationPrompt ? (
            <View style={{ padding: 16, backgroundColor: "#f5f5f5" }}>
              <Text>
                Get a daily digest of today's top story and who's silent on it.
              </Text>
              <View style={{ flexDirection: "row", marginTop: 8, gap: 16 }}>
                <Pressable onPress={handleEnableNotifications}>
                  <Text style={{ color: "#0066cc", fontWeight: "600" }}>Turn on</Text>
                </Pressable>
                <Pressable onPress={handleDismissNotificationPrompt}>
                  <Text style={{ color: "#777" }}>No thanks</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
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
