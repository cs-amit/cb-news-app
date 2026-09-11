import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import {
  fetchPublicProfile,
  fetchPublicLists,
  fetchUserLists,
  fetchOwnCompassStats,
  fetchProfile,
  PublicProfile,
  ListRow,
  OwnCompassStats,
  Profile,
} from "../lib/queries";
import { CompassGauge, CompassDistributionBar } from "./CompassGauge";
import { ShareableCompassBadge } from "./ShareableCompassBadge";
import { colors, fonts } from "../lib/theme";

/**
 * Shared by app/profile/[handle].tsx (viewing anyone by handle, including
 * yourself via a link) and the (tabs)/profile tab (always your own, handle
 * resolved by the caller) -- same screen either way, ownership is computed
 * internally by comparing the viewer's own id to the fetched profile's id.
 */
export function ProfileScreenBody({ handle }: { handle: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [ownCompassStats, setOwnCompassStats] = useState<OwnCompassStats | null>(null);
  const [ownProfile, setOwnProfile] = useState<Profile | null>(null);
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

        // Sample size / distribution are only ever computed from the
        // viewer's OWN poll answers (fetchOwnPollResponses is scoped to
        // user_id === the caller), so this is deliberately skipped for
        // other people's profiles rather than silently showing nothing.
        if (own) {
          setOwnCompassStats(await fetchOwnCompassStats(supabase, found.id));
          setOwnProfile(await fetchProfile(supabase, found.id));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [handle]);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} />;
  if (error || !profile)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          gap: 8,
          backgroundColor: colors.background,
        }}
      >
        <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontFamily: fonts.ui, textAlign: "center" }}>
          {error ?? "Profile not found."}
        </Text>
      </View>
    );

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 20, fontFamily: fonts.headline, color: colors.textPrimary }}>
        @{profile.handle}
      </Text>
      {isOwnProfile && ownProfile && ownProfile.streak_count > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
          <Ionicons name="flame" size={16} color={colors.red} />
          <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
            {ownProfile.streak_count}-day streak · {ownProfile.sides_seen_total} sides seen
          </Text>
        </View>
      ) : null}
      {profile.compass_position !== null ? (
        <View style={{ marginTop: 12 }}>
          <CompassGauge position={profile.compass_position} />
          {isOwnProfile && ownCompassStats ? (
            <>
              <CompassDistributionBar distribution={ownCompassStats.distribution} />
              {ownCompassStats.weekDelta > 0 ? (
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.ui, marginTop: 4 }}>
                  Moved {ownCompassStats.weekDelta.toFixed(1)} point
                  {ownCompassStats.weekDelta === 1 ? "" : "s"} this week
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
      {isOwnProfile ? (
        <Pressable
          onPress={() => router.push("/quiz")}
          style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Ionicons name="compass-outline" size={14} color={colors.primary} />
          <Text style={{ fontFamily: fonts.ui, color: colors.primary }}>Retake the quiz</Text>
        </Pressable>
      ) : null}
      {isOwnProfile && profile.compass_position !== null ? (
        <View style={{ marginTop: 20 }}>
          <ShareableCompassBadge handle={profile.handle} position={profile.compass_position} />
        </View>
      ) : null}
      <Text style={{ marginTop: 20, fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
        {isOwnProfile ? "Your lists" : "Public lists"}
      </Text>
      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/list/${item.id}`)}
            style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>{item.name}</Text>
            {item.description ? (
              <Text style={{ fontFamily: fonts.ui, color: colors.textSecondary }}>{item.description}</Text>
            ) : null}
            {!item.is_public ? (
              <Text style={{ fontSize: 11, fontFamily: fonts.ui, color: colors.red }}>Private</Text>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", gap: 8, marginTop: 16 }}>
            <Ionicons name="list-outline" size={28} color={colors.textSecondary} />
            <Text style={{ fontFamily: fonts.ui, color: colors.textSecondary }}>No lists yet.</Text>
          </View>
        }
      />
      {isOwnProfile ? (
        <Pressable
          onPress={() => router.push("/methodology")}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, paddingVertical: 4 }}
        >
          <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
          <Text style={{ fontSize: 12, fontFamily: fonts.ui, color: colors.textSecondary }}>
            How are these badges calculated? Methodology
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
