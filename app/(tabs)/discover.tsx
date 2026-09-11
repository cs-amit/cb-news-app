import { useEffect, useState } from "react";
import { FlatList, Text, Pressable, View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { fetchDiscoverableProfiles, DiscoverableProfile } from "../../lib/queries";
import { CompassGauge } from "../../components/CompassGauge";
import { colors, fonts } from "../../lib/theme";

export default function DiscoverScreen() {
  const [profiles, setProfiles] = useState<DiscoverableProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetchDiscoverableProfiles(supabase)
      .then((p) => {
        if (!cancelled) setProfiles(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load profiles.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} />;
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 32, alignItems: "center", gap: 8 }}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontFamily: fonts.ui, textAlign: "center" }}>
          Couldn't load profiles: {error}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={profiles}
      keyExtractor={(item) => item.handle}
      ListHeaderComponent={
        <Text
          style={{
            padding: 16,
            paddingBottom: 8,
            fontSize: 12,
            color: colors.textSecondary,
            fontFamily: fonts.ui,
          }}
        >
          See where other readers land on the compass, and what they're curating.
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/profile/${item.handle}`)}
          style={{
            gap: 10,
            padding: 14,
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
            <Text style={{ fontSize: 16, fontFamily: fonts.headline, color: colors.textPrimary }}>
              @{item.handle.replace(/^demo_/, "")}
            </Text>
          </View>
          {item.compassPosition !== null ? <CompassGauge position={item.compassPosition} /> : null}
          {item.previewStories.length > 0 ? (
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.ui }}>
                {item.listName}
              </Text>
              {item.previewStories.map((s, i) => (
                <Text
                  key={i}
                  style={{ fontSize: 13, color: colors.textPrimary, fontFamily: fonts.ui }}
                  numberOfLines={1}
                >
                  · {s.headline ?? "Untitled story"}
                </Text>
              ))}
            </View>
          ) : null}
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
          <Ionicons name="people-outline" size={32} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontFamily: fonts.ui, textAlign: "center" }}>
            No profiles to discover yet.
          </Text>
        </View>
      }
    />
  );
}
