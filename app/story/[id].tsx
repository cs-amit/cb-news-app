import { useEffect, useState } from "react";
import { ScrollView, Text, ActivityIndicator, Linking, Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import { fetchStoryWithArticles, fetchConflictFlags, fetchSilentOutlets } from "../../lib/queries";
import { OutletSummary } from "../../lib/silence";
import { Story, ArticleWithOutlet, ConflictFlag } from "../../lib/types";

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [story, setStory] = useState<Story | null>(null);
  const [articles, setArticles] = useState<ArticleWithOutlet[]>([]);
  const [conflictFlags, setConflictFlags] = useState<ConflictFlag[]>([]);
  const [silentOutlets, setSilentOutlets] = useState<OutletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchStoryWithArticles(supabase, id)
      .then(async ({ story, articles }) => {
        setStory(story);
        setArticles(articles);
        const [flags, silent] = await Promise.all([
          fetchConflictFlags(supabase, id),
          fetchSilentOutlets(supabase, id, story.first_seen_at),
        ]);
        setConflictFlags(flags);
        setSilentOutlets(silent);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (error || !story) return <Text style={{ padding: 16 }}>Couldn't load story: {error}</Text>;

  const flagsByOutlet = new Map(conflictFlags.map((f) => [f.outlet_id, f]));

  return (
    <ScrollView style={{ padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>{story.canonical_headline}</Text>
      {story.summary ? <Text style={{ marginTop: 8, color: "#555" }}>{story.summary}</Text> : null}
      <Text style={{ marginTop: 24, fontWeight: "600" }}>Sources ({articles.length})</Text>
      {articles.map((article) => {
        const outlet = article.outlet;
        const flag = outlet ? flagsByOutlet.get(outlet.id) : undefined;
        const hasScores =
          outlet?.govt_lean_score != null ||
          outlet?.sensationalism_score != null ||
          outlet?.freedom_score != null;
        return (
          <Pressable
            key={article.id}
            onPress={() => Linking.openURL(article.url)}
            style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: "#eee" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
              <Text style={{ fontWeight: "500" }}>{outlet?.name ?? "Unknown outlet"}</Text>
              {outlet?.is_youtube ? (
                <Text style={{ marginLeft: 6, fontSize: 11, color: "#a00", fontWeight: "600" }}>
                  YOUTUBE
                </Text>
              ) : null}
            </View>
            <Text style={{ color: "#333" }}>{article.title}</Text>
            {outlet?.ownership ? (
              <Text style={{ marginTop: 2, fontSize: 12, color: "#777" }}>
                Owned by: {outlet.ownership.owner}
              </Text>
            ) : null}
            {flag ? (
              <Text style={{ marginTop: 2, fontSize: 12, color: "#a00" }}>
                ⚠ Owner mentioned in this story ("{flag.matched_entity}"): {flag.evidence_text}
              </Text>
            ) : null}
            {hasScores ? (
              <Text style={{ marginTop: 2, fontSize: 12, color: "#777" }}>
                {outlet?.govt_lean_score != null ? `Govt-lean: ${outlet.govt_lean_score}/100  ` : ""}
                {outlet?.sensationalism_score != null
                  ? `Sensationalism: ${outlet.sensationalism_score}/100  `
                  : ""}
                {outlet?.freedom_score != null ? `Press freedom: ${outlet.freedom_score}/100` : ""}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
      {silentOutlets.length > 0 ? (
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontWeight: "600" }}>Not yet covered by</Text>
          <Text style={{ marginTop: 4, color: "#555" }}>{silentOutlets.map((o) => o.name).join(", ")}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
