import { useEffect, useState } from "react";
import { ScrollView, Text, ActivityIndicator, Linking, Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import { fetchStoryWithArticles, fetchConflictFlags, fetchSilentOutlets } from "../../lib/queries";
import { OutletSummary } from "../../lib/silence";
import { pickComparisonArticles } from "../../lib/comparison";
import { Story, ArticleWithOutlet, ConflictFlag } from "../../lib/types";

// Shared country baseline every outlet starts from (RSF World Press Freedom
// Index score for India), mirrored from the seed data and the Methodology
// screen. Used only to label a score as the shared baseline vs. an
// outlet-specific penalty — never to compute a score.
const INDIA_BASELINE_FREEDOM_SCORE = 32;

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
        // Badges are an enhancement on top of the core story view, not a
        // precondition for it — a failure fetching them (RLS hiccup,
        // transient network blip) must not discard an already-successfully-
        // loaded story and show a full error screen. Fail soft: log and
        // leave conflictFlags/silentOutlets at their empty-array default.
        try {
          const [flags, silent] = await Promise.all([
            fetchConflictFlags(supabase, id),
            fetchSilentOutlets(supabase, id, story.first_seen_at),
          ]);
          setConflictFlags(flags);
          setSilentOutlets(silent);
        } catch (err) {
          console.error(
            "Failed to load story badges:",
            err instanceof Error ? err.message : err
          );
        }
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
        // Only needed when this outlet is flagged — computing it unconditionally
        // is cheap (no fetch, just filtering/sorting the already-loaded list).
        const comparisons = flag && outlet
          ? pickComparisonArticles(articles, outlet.id, outlet.govt_lean_score)
          : [];
        const hasScores =
          outlet?.govt_lean_score != null ||
          outlet?.sensationalism_score != null ||
          outlet?.freedom_score != null;
        // Sample size / last-updated provenance for the govt-lean score, which
        // the Methodology page promises is shown alongside every score.
        const govtLeanProvenance =
          outlet?.govt_lean_sample_size != null && outlet?.govt_lean_updated_at
            ? ` (n=${outlet.govt_lean_sample_size}, updated ${new Date(
                outlet.govt_lean_updated_at
              ).toLocaleDateString()})`
            : "";
        // Most outlets carry the identical country-baseline freedom score, so a
        // flat "Press freedom" label reads as an outlet-specific rating it
        // isn't. Qualify the label whenever the outlet is still sitting on the
        // shared baseline; only an outlet that actually took the documented-
        // incident penalty (explained by the note rendered just above) gets the
        // unqualified label. Keyed off the score rather than merely the
        // presence of a note, because a note does not always drive a penalty
        // (e.g. an independence note on a baseline-scored outlet).
        const freedomLabel =
          outlet?.freedom_score === INDIA_BASELINE_FREEDOM_SCORE
            ? "Press freedom (India baseline)"
            : "Press freedom";
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
            {outlet?.ownership?.citation_url ? (
              <Text style={{ fontSize: 11, color: "#999" }}>
                Source: {outlet.ownership.citation_url}
              </Text>
            ) : null}
            {outlet?.ownership?.note ? (
              <Text style={{ marginTop: 2, fontSize: 12, color: "#777" }}>
                Press freedom note: {outlet.ownership.note}
                {outlet.ownership.note_citation_url
                  ? ` (source: ${outlet.ownership.note_citation_url})`
                  : ""}
              </Text>
            ) : null}
            {flag ? (
              <Text style={{ marginTop: 2, fontSize: 12, color: "#a00" }}>
                ⚠ Owner mentioned in this story ("{flag.matched_entity}"): {flag.evidence_text}
              </Text>
            ) : null}
            {comparisons.length > 0 ? (
              <View style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: "#777" }}>Compare coverage:</Text>
                {comparisons.map((comparisonArticle) => (
                  <Pressable
                    key={comparisonArticle.id}
                    onPress={(e) => {
                      e.stopPropagation();
                      Linking.openURL(comparisonArticle.url);
                    }}
                  >
                    <Text style={{ fontSize: 12, color: "#0066cc", marginTop: 2 }}>
                      {comparisonArticle.outlet?.name ?? "Unknown outlet"}: {comparisonArticle.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {hasScores ? (
              <Text style={{ marginTop: 2, fontSize: 12, color: "#777" }}>
                {outlet?.govt_lean_score != null
                  ? `Govt-lean: ${outlet.govt_lean_score}/100${govtLeanProvenance}  `
                  : ""}
                {outlet?.sensationalism_score != null
                  ? `Sensationalism: ${outlet.sensationalism_score}/100  `
                  : ""}
                {outlet?.freedom_score != null
                  ? `${freedomLabel}: ${outlet.freedom_score}/100`
                  : ""}
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
