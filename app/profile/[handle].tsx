import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getUserId } from "../../lib/auth";
import {
  fetchPublicProfile,
  fetchPublicLists,
  fetchUserLists,
  fetchOwnCompassStats,
  PublicProfile,
  ListRow,
  OwnCompassStats,
} from "../../lib/queries";
import { CompassGauge, CompassDistributionBar } from "../../components/CompassGauge";
import { colors, fonts } from "../../lib/theme";

export default function ProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [ownCompassStats, setOwnCompassStats] = useState<OwnCompassStats | null>(null);
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
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [handle]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (error || !profile)
    return (
      <Text style={{ padding: 16, fontFamily: fonts.ui, color: colors.textPrimary }}>
        {error ?? "Profile not found."}
      </Text>
    );

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 20, fontFamily: fonts.headline, color: colors.textPrimary }}>
        @{profile.handle}
      </Text>
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
          <Text style={{ fontFamily: fonts.ui, color: colors.textSecondary, marginTop: 8 }}>
            No lists yet.
          </Text>
        }
      />
    </View>
  );
}
