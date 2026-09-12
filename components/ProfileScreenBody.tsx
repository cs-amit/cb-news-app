import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, ScrollView } from "react-native";
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

  const displayPosition = isOwnProfile ? (ownProfile?.compass_position ?? null) : profile.compass_position;
  const card = {
    marginTop: 16,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceElevated }}>
      <View style={{ padding: 16 }}>
        {/* Identity header: avatar + handle + streak, one visual unit
            instead of loose stacked text. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 18,
            borderRadius: 14,
            backgroundColor: colors.navy,
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="person" size={26} color={colors.background} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontFamily: fonts.headline, color: colors.background }}>
              @{profile.handle}
            </Text>
            {isOwnProfile && ownProfile && ownProfile.streak_count > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
                <Ionicons name="flame" size={14} color="#F5A15C" />
                <Text style={{ fontSize: 12.5, fontFamily: fonts.ui, color: "#D6DEEB" }}>
                  {ownProfile.streak_count}-day streak · {ownProfile.sides_seen_total} sides seen
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Own profile uses the real, ungated position (fetchProfile reads
            the owner-only profiles table directly) -- profile.compass_position
            comes from the public_profiles view, which nulls it out whenever
            compass_public is off. Without this, an owner who has taken the
            quiz but never toggled compass_public couldn't see their OWN
            result on their OWN profile, which is the bug this fixes. */}
        {displayPosition !== null ? (
          <View style={card}>
            <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 0.6, color: colors.primary, textTransform: "uppercase", marginBottom: 10 }}>
              Compass
            </Text>
            <CompassGauge position={displayPosition} />
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
            {isOwnProfile ? (
              <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderColor: colors.border }}>
                <ShareableCompassBadge handle={profile.handle} position={displayPosition} />
              </View>
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

        <View style={card}>
          <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 0.6, color: colors.primary, textTransform: "uppercase", marginBottom: 6 }}>
            {isOwnProfile ? "Your lists" : "Public lists"}
          </Text>
          <FlatList
            data={lists}
            scrollEnabled={false}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/list/${item.id}`)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Ionicons
                  name={item.is_public ? "list-outline" : "lock-closed-outline"}
                  size={16}
                  color={colors.textSecondary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>{item.name}</Text>
                  {item.description ? (
                    <Text style={{ fontSize: 12.5, fontFamily: fonts.ui, color: colors.textSecondary }}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                {!item.is_public ? (
                  <Text style={{ fontSize: 11, fontFamily: fonts.uiSemiBold, color: colors.red }}>Private</Text>
                ) : null}
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={{ alignItems: "center", gap: 8, paddingVertical: 16 }}>
                <Ionicons name="list-outline" size={28} color={colors.textSecondary} />
                <Text style={{ fontFamily: fonts.ui, color: colors.textSecondary }}>No lists yet.</Text>
              </View>
            }
          />
        </View>

        {isOwnProfile ? (
          <Pressable
            onPress={() => router.push("/methodology")}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 20, paddingVertical: 4 }}
          >
            <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={{ fontSize: 12, fontFamily: fonts.ui, color: colors.textSecondary }}>
              How are these badges calculated? Methodology
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}
