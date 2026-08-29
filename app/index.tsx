import { useEffect, useState } from "react";
import { FlatList, Text, Pressable, View, ActivityIndicator, TextInput } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import {
  fetchRecentStories,
  fetchProfile,
  fetchStoryWithArticles,
  fetchSilentOutlets,
  recomputeAndSaveStreak,
  addStoryToList,
  fetchUserLists,
  completePendingHandleClaim,
  recoverPendingHandleClaim,
  Profile,
} from "../lib/queries";
import { Story } from "../lib/types";
import { isValidHandle, readPendingHandle, clearPendingHandle } from "../lib/handle";
import {
  requestNotificationPermission,
  ensureAndroidChannel,
  scheduleDailyDigest,
} from "../lib/notifications";
import { buildDailyDigestCopy } from "../lib/notificationCopy";
import { colors, fonts } from "../lib/theme";

const NOTIFICATION_PROMPT_DISMISSED_KEY = "notificationPromptDismissed";
const UPGRADE_PROMPT_STREAK_MILESTONE = 3;
const UPGRADE_PROMPT_DISMISSED_KEY = "upgradePromptDismissed";

export default function FeedScreen() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [ownHandle, setOwnHandle] = useState<string | null>(null);
  const [repostsListId, setRepostsListId] = useState<string | null>(null);
  // I3 recovery: shown when the user's email is confirmed but no handle got
  // claimed automatically (no locally-stored pending handle to auto-apply —
  // e.g. app data was cleared, or confirmation happened via a different
  // install). See handleClaimRecoveryHandle below.
  const [showHandleRecovery, setShowHandleRecovery] = useState(false);
  const [recoveryHandle, setRecoveryHandle] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const router = useRouter();

  // Shared by the initial profile load and both handle-claim success paths
  // below so ownHandle/repostsListId reflect a just-claimed handle in the
  // same session, without duplicating the fetch-and-set logic three times.
  async function loadOwnHandleAndLists(id: string, handle: string) {
    setOwnHandle(handle);
    try {
      const lists = await fetchUserLists(supabase, id);
      const reposts = lists.find((l) => l.is_default);
      if (reposts) setRepostsListId(reposts.id);
    } catch (err) {
      console.error("Failed to load reposts list:", err);
    }
  }

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
        // Recompute the streak/sides-seen numbers before reading the profile
        // for display. The Story screen is the only other place that ever
        // recomputes them (on an article tap), and Expo Router keeps this
        // Feed screen mounted while the user navigates to a story and back —
        // without this, a stale streak from before the visit would keep
        // showing, and a lapsed streak would never converge back down.
        await recomputeAndSaveStreak(supabase, id);
        const p = await fetchProfile(supabase, id);
        setProfile(p);

        if (p?.handle) {
          await loadOwnHandleAndLists(id, p.handle);
        } else if (p) {
          // No handle yet — this is either a plain anonymous user who never
          // started the upgrade flow (nothing to do), or someone mid-upgrade
          // whose email may since have been confirmed out-of-band (a tapped
          // link, not an in-app action — see lib/auth.ts's refreshSession
          // comment). Check every app open, not just once at signup, so a
          // confirmation that lands later still gets picked up.
          try {
            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError) throw userError;
            if (userData.user?.email_confirmed_at) {
              const pendingHandle = await readPendingHandle();
              if (pendingHandle) {
                try {
                  await completePendingHandleClaim(supabase, id, pendingHandle);
                  await clearPendingHandle();
                  const refreshed = await fetchProfile(supabase, id);
                  setProfile(refreshed);
                  if (refreshed?.handle) await loadOwnHandleAndLists(id, refreshed.handle);
                } catch (err) {
                  console.error("Failed to complete pending handle claim:", err);
                  // Re-fetch (via recoverPendingHandleClaim) before deciding
                  // what to show — claimHandle may have actually succeeded
                  // even though the overall call threw (see that function's
                  // comment in lib/queries.ts). Falling through to the
                  // recovery UI on the stale in-memory null here would let
                  // the user type a DIFFERENT handle and silently overwrite
                  // the one that was already successfully claimed.
                  let refetched: Profile | null = null;
                  try {
                    refetched = await recoverPendingHandleClaim(supabase, id);
                  } catch (fetchErr) {
                    console.error("Failed to re-check profile after failed claim:", fetchErr);
                  }
                  if (refetched?.handle) {
                    // The claim went through; recoverPendingHandleClaim
                    // already retried the list creation. Never show the
                    // recovery UI here: the handle is already claimed, so
                    // there is nothing for the user to "recover" and no
                    // handle input should be offered.
                    await clearPendingHandle();
                    setProfile(refetched);
                    await loadOwnHandleAndLists(id, refetched.handle);
                  } else {
                    // Genuinely still unclaimed (e.g. someone else claimed
                    // the same handle in the meantime). Don't clear the
                    // pending handle (so it's still there to inspect/retry
                    // via the recovery form's own claim attempt), and fall
                    // through to the recovery UI so the user can pick a
                    // different one.
                    setShowHandleRecovery(true);
                  }
                }
              } else {
                // Confirmed, but nothing locally stored to auto-apply.
                setShowHandleRecovery(true);
              }
            }
          } catch (err) {
            console.error("Failed to check email confirmation status:", err);
          }
        }

        if (p?.notification_opt_in) {
          // Already opted in: keep the notification's content fresh every
          // time the app is opened, since there is no server push to do
          // this in the background.
          rescheduleDigest(p.notification_hour);
        } else if (p && p.streak_count >= 1) {
          const dismissed = await AsyncStorage.getItem(NOTIFICATION_PROMPT_DISMISSED_KEY);
          if (!dismissed) setShowNotificationPrompt(true);
        }

        if (p && p.streak_count >= UPGRADE_PROMPT_STREAK_MILESTONE) {
          const dismissed = await AsyncStorage.getItem(UPGRADE_PROMPT_DISMISSED_KEY);
          if (!dismissed) setShowUpgradePrompt(true);
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
      // Real per-story counts, not hardcoded placeholders — the opt-in
      // banner promises a genuine silence signal ("who's silent on it"),
      // so the digest must reflect this story's actual source/silent
      // counts rather than a flat sourceCount:1/silentCount:0 that made
      // the feature a no-op and read as ungrammatical "1 sources."
      const [{ articles }, silentOutlets] = await Promise.all([
        fetchStoryWithArticles(supabase, top.id),
        fetchSilentOutlets(supabase, top.id, top.first_seen_at),
      ]);
      const content = buildDailyDigestCopy({
        topStoryHeadline: top.canonical_headline ?? "Today's top story",
        sourceCount: articles.length,
        silentCount: silentOutlets.length,
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

  async function handleDismissUpgradePrompt() {
    setShowUpgradePrompt(false);
    await AsyncStorage.setItem(UPGRADE_PROMPT_DISMISSED_KEY, "true");
  }

  async function handleClaimRecoveryHandle() {
    if (!userId) return;
    const trimmed = recoveryHandle.trim().toLowerCase();
    if (!isValidHandle(trimmed)) {
      setRecoveryError("Handle must be 3-20 characters: lowercase letters, digits, or underscore.");
      return;
    }
    setRecoverySubmitting(true);
    setRecoveryError("");
    try {
      await completePendingHandleClaim(supabase, userId, trimmed);
      // Clears any stale pending handle left over from a failed automatic
      // claim attempt (e.g. it was taken by someone else) — this manually
      // typed handle is the one that actually got claimed, so nothing
      // should be left around to (harmlessly, but confusingly) linger.
      await clearPendingHandle();
      setShowHandleRecovery(false);
      const refreshed = await fetchProfile(supabase, userId);
      setProfile(refreshed);
      if (refreshed?.handle) await loadOwnHandleAndLists(userId, refreshed.handle);
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : "Couldn't save that handle.");
    } finally {
      setRecoverySubmitting(false);
    }
  }

  async function handleRepost(storyId: string) {
    if (!repostsListId) return;
    try {
      await addStoryToList(supabase, repostsListId, storyId);
    } catch (err) {
      console.error("Failed to repost story:", err);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (error) return <Text style={{ padding: 16, color: colors.textPrimary, fontFamily: fonts.ui }}>Couldn't load stories: {error}</Text>;

  return (
    <FlatList
      data={stories}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          {showUpgradePrompt ? (
            <View style={{ padding: 16, backgroundColor: colors.surfaceSubtle }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.ui }}>
                Nice, a {profile?.streak_count}-day streak! Save your progress so it's not lost if
                you reinstall.
              </Text>
              <View style={{ flexDirection: "row", marginTop: 8, gap: 16 }}>
                <Pressable onPress={() => router.push("/upgrade")}>
                  <Text style={{ color: colors.primary, fontFamily: fonts.uiSemiBold }}>Add email</Text>
                </Pressable>
                <Pressable onPress={handleDismissUpgradePrompt}>
                  <Text style={{ color: colors.textSecondary, fontFamily: fonts.ui }}>Maybe later</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {showHandleRecovery ? (
            <View style={{ padding: 16, backgroundColor: colors.surfaceSubtle }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.ui }}>
                Your email is confirmed. Pick a handle to finish setting up sharing and your
                public profile.
              </Text>
              <TextInput
                value={recoveryHandle}
                onChangeText={setRecoveryHandle}
                placeholder="handle (lowercase, 3-20 chars)"
                autoCapitalize="none"
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 4,
                  padding: 12,
                  fontFamily: fonts.ui,
                  color: colors.textPrimary,
                }}
              />
              {recoveryError ? (
                <Text style={{ marginTop: 4, color: colors.red, fontFamily: fonts.ui }}>{recoveryError}</Text>
              ) : null}
              <View style={{ flexDirection: "row", marginTop: 8, gap: 16 }}>
                <Pressable onPress={handleClaimRecoveryHandle} disabled={recoverySubmitting}>
                  <Text style={{ color: colors.primary, fontFamily: fonts.uiSemiBold }}>
                    {recoverySubmitting ? "Saving..." : "Save handle"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {showNotificationPrompt ? (
            <View style={{ padding: 16, backgroundColor: colors.surfaceSubtle }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.ui }}>
                Get a daily digest of today's top story and who's silent on it.
              </Text>
              <View style={{ flexDirection: "row", marginTop: 8, gap: 16 }}>
                <Pressable onPress={handleEnableNotifications}>
                  <Text style={{ color: colors.primary, fontFamily: fonts.uiSemiBold }}>Turn on</Text>
                </Pressable>
                <Pressable onPress={handleDismissNotificationPrompt}>
                  <Text style={{ color: colors.textSecondary, fontFamily: fonts.ui }}>No thanks</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {profile && profile.streak_count > 0 ? (
            <Text style={{ padding: 16, paddingBottom: 0, fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
              {profile.streak_count}-day streak · {profile.sides_seen_total} sides seen
            </Text>
          ) : null}
          <Pressable onPress={() => router.push("/methodology")} style={{ padding: 16 }}>
            <Text style={{ color: colors.primary, fontFamily: fonts.ui }}>How are these badges calculated? Methodology →</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/quiz")} style={{ padding: 16, paddingTop: 0 }}>
            <Text style={{ color: colors.primary, fontFamily: fonts.ui }}>
              {profile?.compass_quiz_taken_at
                ? "Your compass position →"
                : "Where do you stand? Take the compass quiz →"}
            </Text>
          </Pressable>
          {ownHandle ? (
            <Pressable onPress={() => router.push(`/profile/${ownHandle}`)} style={{ padding: 16, paddingTop: 0 }}>
              <Text style={{ color: colors.primary, fontFamily: fonts.ui }}>My profile →</Text>
            </Pressable>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/story/${item.id}`)}
          style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ fontSize: 16, fontFamily: fonts.headline, color: colors.textPrimary }}>
            {item.canonical_headline ?? "Untitled story"}
          </Text>
          {item.summary ? <Text style={{ marginTop: 4, color: colors.textSecondary, fontFamily: fonts.ui }}>{item.summary}</Text> : null}
          {repostsListId ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleRepost(item.id);
              }}
              style={{ marginTop: 6 }}
            >
              <Text style={{ fontSize: 12, color: colors.primary, fontFamily: fonts.ui }}>Repost to my profile</Text>
            </Pressable>
          ) : null}
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={{ padding: 16 }}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.ui }}>No stories yet.</Text>
        </View>
      }
    />
  );
}
