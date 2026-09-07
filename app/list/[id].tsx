import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { fetchListById, fetchListItems, ListRow, ListItemRow } from "../../lib/queries";
import { colors, fonts } from "../../lib/theme";

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [list, setList] = useState<ListRow | null>(null);
  const [items, setItems] = useState<ListItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const found = await fetchListById(supabase, id);
        if (!found) {
          setError("No list with that id.");
          setLoading(false);
          return;
        }
        setList(found);
        const listItems = await fetchListItems(supabase, id);
        setItems(listItems);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load list.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (error || !list)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 }}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontFamily: fonts.ui, textAlign: "center" }}>
          {error ?? "List not found."}
        </Text>
      </View>
    );

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 20, fontFamily: fonts.headline, color: colors.textPrimary }}>{list.name}</Text>
      {list.description ? (
        <Text style={{ marginTop: 4, color: colors.textSecondary, fontFamily: fonts.ui }}>{list.description}</Text>
      ) : null}
      {!list.is_public ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
          <Ionicons name="lock-closed-outline" size={12} color={colors.red} />
          <Text style={{ fontSize: 11, color: colors.red, fontFamily: fonts.ui }}>Private</Text>
        </View>
      ) : null}
      <FlatList
        style={{ marginTop: 20 }}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/story/${item.story_id}`)}
            style={{
              flexDirection: "row",
              gap: 12,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            {item.story?.image_url ? (
              <Image
                source={{ uri: item.story.image_url }}
                style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: colors.surfaceSubtle }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  backgroundColor: colors.surfaceSubtle,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="newspaper-outline" size={20} color={colors.textSecondary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
                {item.story?.canonical_headline ?? "Untitled story"}
              </Text>
              {item.story?.summary ? (
                <Text
                  style={{ marginTop: 2, color: colors.textSecondary, fontFamily: fonts.ui }}
                  numberOfLines={2}
                >
                  {item.story.summary}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", gap: 8, marginTop: 32 }}>
            <Ionicons name="bookmark-outline" size={28} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontFamily: fonts.ui }}>No stories yet.</Text>
          </View>
        }
      />
    </View>
  );
}
