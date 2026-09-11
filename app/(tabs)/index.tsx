import { useEffect, useState } from "react";
import {
  FlatList,
  Text,
  Pressable,
  View,
  ActivityIndicator,
  TextInput,
  StyleProp,
  ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { getUserId } from "../../lib/auth";
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
} from "../../lib/queries";
import { Story } from "../../lib/types";
import { isValidHandle, readPendingHandle, clearPendingHandle } from "../../lib/handle";
import {
  requestNotificationPermission,
  ensureAndroidChannel,
  scheduleDailyDigest,
} from "../../lib/notifications";
import { buildDailyDigestCopy } from "../../lib/notificationCopy";
import { Button } from "../../components/Button";
import { colors, fonts } from "../../lib/theme";
import { TOPICS_ALL, TOPIC_LABELS } from "../../lib/topics";

const NOTIFICATION_PROMPT_DISMISSED_KEY = "notificationPromptDismissed";
const UPGRADE_PROMPT_STREAK_MILESTONE = 3;
const UPGRADE_PROMPT_DISMISSED_KEY = "upgradePromptDismissed";

const TOPICS = TOPICS_ALL.filter((t) => t !== "other");

function NavLink({
  icon,
  label,
  onPress,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
        style,
      ]}
    >
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={{ flex: 1, color: colors.primary, fontFamily: fonts.ui }}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.primary} />
    </Pressable>
  );
}

type FeedView = "compare" | "single";

// A story only supports a comparison if 2+ outlets have covered it —
// below that there's nothing to compare, so it belongs in Single source.
const COMPARE_MIN_SOURCES = 2;

export default function FeedScreen() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [feedView, setFeedView] = useState<FeedView>("compare");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [repostsListId, setRepostsListId] = useState<string | null>(null);
  const [repostStatus, setRepostStatus] = useState<Record<string, "pending" | "done" | "error">>({});
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
  // below so repostsListId reflects a just-claimed handle in the same
  // session, without duplicating the fetch-and-set logic three times.
  async function loadRepostsList(id: string) {
    try {
      const lists = await fetchUserLists(supabase, id);
      const reposts = lists.find((l) => l.is_default);
      if (reposts) setRepostsListId(reposts.id);
    } catch (err) {
      console.error("Failed to load reposts list:", err);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    fetchRecentStories(supabase, selectedTopic ?? undefined, feedView)
      .then((s) => {
        if (!cancelled) setStories(s);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTopic, feedView]);

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
          await loadRepostsList(id);
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
                  if (refreshed?.handle) await loadRepostsList(id);
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
                    await loadRepostsList(id);
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
      if (refreshed?.handle) await loadRepostsList(userId);
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : "Couldn't save that handle.");
    } finally {
      setRecoverySubmitting(false);
    }
  }

  // Previously gave zero visible feedback either way -- a successful repost
  // looked identical to a silently-swallowed failure, which is almost
  // certainly why this looked "broken" even when it was actually working.
  async function handleRepost(storyId: string) {
    if (!repostsListId) return;
    setRepostStatus((prev) => ({ ...prev, [storyId]: "pending" }));
    try {
      await addStoryToList(supabase, repostsListId, storyId);
      setRepostStatus((prev) => ({ ...prev, [storyId]: "done" }));
    } catch (err) {
      console.error("Failed to repost story:", err);
      setRepostStatus((prev) => ({ ...prev, [storyId]: "error" }));
    }
  }

  if (loading && stories.length === 0)
    return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} />;
  if (error) return <Text style={{ padding: 16, color: colors.textPrimary, fontFamily: fonts.ui }}>Couldn't load stories: {error}</Text>;

  // Server-side filtered per feedView now (fetchRecentStories), so `stories`
  // already only contains the right set -- no client-side re-filter needed.
  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
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
              <View style={{ flexDirection: "row", marginTop: 12, gap: 12 }}>
                <Button label="Add email" onPress={() => router.push("/upgrade")} />
                <Button label="Maybe later" onPress={handleDismissUpgradePrompt} variant="secondary" />
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
              <View style={{ flexDirection: "row", marginTop: 12 }}>
                <Button label="Save handle" onPress={handleClaimRecoveryHandle} loading={recoverySubmitting} />
              </View>
            </View>
          ) : null}
          {showNotificationPrompt ? (
            <View style={{ padding: 16, backgroundColor: colors.surfaceSubtle }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.ui }}>
                Get a daily digest of today's top story and who's silent on it.
              </Text>
              <View style={{ flexDirection: "row", marginTop: 12, gap: 12 }}>
                <Button label="Turn on" onPress={handleEnableNotifications} />
                <Button label="No thanks" onPress={handleDismissNotificationPrompt} variant="secondary" />
              </View>
            </View>
          ) : null}
          {profile && profile.streak_count > 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                padding: 16,
                paddingBottom: 0,
              }}
            >
              <Ionicons name="flame" size={16} color={colors.red} />
              <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
                {profile.streak_count}-day streak · {profile.sides_seen_total} sides seen
              </Text>
            </View>
          ) : null}
          {/* Compare is the default, primary experience -- Single source is
              deliberately a small, secondary link rather than an equal-weight
              tab, so it doesn't compete with Compare for attention. */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              paddingBottom: 0,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: fonts.ui, flex: 1 }}>
              {feedView === "compare"
                ? "Stories covered by 2 or more outlets, so you can compare how they're reported."
                : "Stories only one outlet has covered so far."}
            </Text>
            <Pressable
              onPress={() => setFeedView(feedView === "compare" ? "single" : "compare")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 8 }}
            >
              <Text style={{ fontSize: 12, fontFamily: fonts.ui, color: colors.textSecondary }}>
                {feedView === "compare" ? "Single source" : "Back to Compare"}
              </Text>
              <Ionicons name="chevron-forward" size={12} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 16, paddingTop: 12 }}>
            <Pressable
              onPress={() => setSelectedTopic(null)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text
                style={{
                  fontFamily: selectedTopic === null ? fonts.uiSemiBold : fonts.ui,
                  color: selectedTopic === null ? colors.primary : colors.textSecondary,
                }}
              >
                All
              </Text>
            </Pressable>
            {TOPICS.map((t) => (
              <Pressable
                key={t}
                onPress={() => setSelectedTopic(t)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Text
                  style={{
                    fontFamily: selectedTopic === t ? fonts.uiSemiBold : fonts.ui,
                    color: selectedTopic === t ? colors.primary : colors.textSecondary,
                  }}
                >
                  {TOPIC_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>
          <NavLink
            icon="information-circle-outline"
            label="How are these badges calculated? Methodology"
            onPress={() => router.push("/methodology")}
            style={{ paddingTop: 16 }}
          />
          <NavLink
            icon="compass-outline"
            label={
              profile?.compass_quiz_taken_at
                ? "Your compass position"
                : "Where do you stand? Take the compass quiz"
            }
            onPress={() => router.push("/quiz")}
          />
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/story/${item.id}`)}
          style={{
            flexDirection: "row",
            gap: 12,
            padding: 12,
            marginHorizontal: 16,
            marginVertical: 6,
            borderRadius: 12,
            backgroundColor: colors.background,
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={{ width: 84, height: 84, borderRadius: 10, backgroundColor: colors.surfaceSubtle }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 10,
                backgroundColor: colors.surfaceSubtle,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="newspaper-outline" size={24} color={colors.textSecondary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontFamily: fonts.headline, color: colors.textPrimary }}>
              {item.canonical_headline ?? "Untitled story"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Ionicons
                name={item.article_count >= COMPARE_MIN_SOURCES ? "layers-outline" : "document-outline"}
                size={12}
                color={colors.textSecondary}
              />
              <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: fonts.ui }}>
                {item.article_count} source{item.article_count === 1 ? "" : "s"}
              </Text>
            </View>
            {item.summary ? (
              <Text
                style={{ marginTop: 4, color: colors.textSecondary, fontFamily: fonts.ui }}
                numberOfLines={2}
              >
                {item.summary}
              </Text>
            ) : null}
            {repostsListId ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  handleRepost(item.id);
                }}
                disabled={repostStatus[item.id] === "pending" || repostStatus[item.id] === "done"}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}
              >
                <Ionicons
                  name={
                    repostStatus[item.id] === "done"
                      ? "bookmark"
                      : repostStatus[item.id] === "error"
                        ? "alert-circle-outline"
                        : "bookmark-outline"
                  }
                  size={13}
                  color={repostStatus[item.id] === "error" ? colors.red : colors.primary}
                />
                <Text
                  style={{
                    fontSize: 12,
                    color: repostStatus[item.id] === "error" ? colors.red : colors.primary,
                    fontFamily: fonts.ui,
                  }}
                >
                  {repostStatus[item.id] === "done"
                    ? "Reposted"
                    : repostStatus[item.id] === "pending"
                      ? "Reposting…"
                      : repostStatus[item.id] === "error"
                        ? "Couldn't repost — tap to retry"
                        : "Repost to my profile"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
          <Ionicons name="newspaper-outline" size={32} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontFamily: fonts.ui, textAlign: "center" }}>
            {(() => {
              const topicSuffix = selectedTopic
                ? ` tagged "${TOPIC_LABELS[selectedTopic as keyof typeof TOPIC_LABELS] ?? selectedTopic}"`
                : "";
              // `stories` is now server-filtered to just this tab (fetchRecentStories'
              // view param), so we no longer know the other tab's count here without
              // a second query -- always give the tab-specific message.
              return feedView === "compare"
                ? `No stories${topicSuffix} with 2+ sources yet. Check Single source instead.`
                : `No single-source stories${topicSuffix} right now — everything's in Compare.`;
            })()}
          </Text>
        </View>
      }
    />
  );
}
