import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { fetchListById, fetchListItems, ListRow, ListItemRow } from "../../lib/queries";

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
  if (error || !list) return <Text style={{ padding: 16 }}>{error ?? "List not found."}</Text>;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>{list.name}</Text>
      {list.description ? <Text style={{ marginTop: 4, color: "#555" }}>{list.description}</Text> : null}
      {!list.is_public ? <Text style={{ fontSize: 11, color: "#a00", marginTop: 4 }}>Private</Text> : null}
      <FlatList
        style={{ marginTop: 20 }}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/story/${item.story_id}`)}
            style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee" }}
          >
            <Text style={{ fontWeight: "500" }}>
              {item.story?.canonical_headline ?? "Untitled story"}
            </Text>
            {item.story?.summary ? <Text style={{ color: "#777" }}>{item.story.summary}</Text> : null}
          </Pressable>
        )}
        ListEmptyComponent={<Text style={{ color: "#777", marginTop: 8 }}>No stories yet.</Text>}
      />
    </View>
  );
}
