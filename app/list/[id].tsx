import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
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
      <Text style={{ padding: 16, fontFamily: fonts.ui, color: colors.textPrimary }}>
        {error ?? "List not found."}
      </Text>
    );

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 20, fontFamily: fonts.headline, color: colors.textPrimary }}>{list.name}</Text>
      {list.description ? (
        <Text style={{ marginTop: 4, color: colors.textSecondary, fontFamily: fonts.ui }}>{list.description}</Text>
      ) : null}
      {!list.is_public ? (
        <Text style={{ fontSize: 11, color: colors.red, marginTop: 4, fontFamily: fonts.ui }}>Private</Text>
      ) : null}
      <FlatList
        style={{ marginTop: 20 }}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/story/${item.story_id}`)}
            style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
              {item.story?.canonical_headline ?? "Untitled story"}
            </Text>
            {item.story?.summary ? (
              <Text style={{ color: colors.textSecondary, fontFamily: fonts.ui }}>{item.story.summary}</Text>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.textSecondary, marginTop: 8, fontFamily: fonts.ui }}>No stories yet.</Text>
        }
      />
    </View>
  );
}
