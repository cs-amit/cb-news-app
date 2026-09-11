import { useEffect, useState } from "react";
import { ScrollView, Text, ActivityIndicator, Linking, Pressable, View, Share } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getUserId } from "../../lib/auth";
import {
  fetchStoryWithArticles,
  fetchConflictFlags,
  fetchSilentOutlets,
  fetchFactChecks,
  fetchDiscoveredArticles,
  recordArticleView,
  recomputeAndSaveStreak,
  submitPollResponse,
  fetchPollTally,
  fetchPollTallies,
  applyPollDrift,
  FactCheck,
  PollTally,
} from "../../lib/queries";
import { shouldShowPoll } from "../../lib/polls";
import { OutletSummary } from "../../lib/silence";
import { outletFaviconUrl } from "../../lib/outletFavicon";

const styles = {
  sectionCard: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  scoreChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: colors.surfaceSubtle,
  },
  scoreChipText: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.ui },
};
import { pickComparisonArticles, pickFramingSpectrum } from "../../lib/comparison";
import { buildShareText } from "../../lib/shareCopy";
import { Story, ArticleWithOutlet, ConflictFlag, DiscoveredArticle } from "../../lib/types";
import { colors, fonts, verdictColors, pollColors, Verdict, PollResponse } from "../../lib/theme";

const VERDICT_ICONS: Record<Verdict, keyof typeof Ionicons.glyphMap> = {
  True: "checkmark-circle",
  False: "close-circle",
  Misleading: "warning",
  Unverified: "help-circle",
};

/** Small circular outlet mark: favicon when we can derive one, initial otherwise. */
function OutletMark({ name, rssUrl, size = 20 }: { name: string; rssUrl: string | null; size?: number }) {
  const favicon = outletFaviconUrl(rssUrl);
  if (favicon) {
    return (
      <Image
        source={{ uri: favicon }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSubtle }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.surfaceSubtle,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.5, fontFamily: fonts.uiSemiBold, color: colors.textSecondary }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

// Shared country baseline every outlet starts from (RSF World Press Freedom
// Index score for India), mirrored from the seed data and the Methodology
// screen. Used only to label a score as the shared baseline vs. an
// outlet-specific penalty — never to compute a score.
const INDIA_BASELINE_FREEDOM_SCORE = 32;

// How many silent-outlet marks to show before collapsing behind "Show all" —
// the whole point of this fix is not dumping every name into one sentence.
const SILENT_PREVIEW_COUNT = 6;

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [story, setStory] = useState<Story | null>(null);
  const [articles, setArticles] = useState<ArticleWithOutlet[]>([]);
  const [conflictFlags, setConflictFlags] = useState<ConflictFlag[]>([]);
  const [silentOutlets, setSilentOutlets] = useState<OutletSummary[]>([]);
  const [factChecks, setFactChecks] = useState<FactCheck[]>([]);
  const [discoveredArticles, setDiscoveredArticles] = useState<DiscoveredArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [pollTallies, setPollTallies] = useState<Record<string, PollTally>>({});
  const [showAllSilent, setShowAllSilent] = useState(false);

  async function handlePollResponse(outletId: string, response: "critical" | "balanced" | "friendly") {
    if (!userId) return;
    try {
      await submitPollResponse(supabase, userId, story!.id, outletId, response);
      const tally = await fetchPollTally(supabase, story!.id, outletId);
      setPollTallies((prev) => ({ ...prev, [outletId]: tally }));
      // Fire-and-forget: a drift-save hiccup must never block the tally the
      // user is watching update in front of them.
      applyPollDrift(supabase, userId, response).catch((err) =>
        console.error("Failed to apply compass drift:", err)
      );
    } catch (err) {
      console.error("Failed to submit poll response:", err);
    }
  }

  useEffect(() => {
    getUserId(supabase)
      .then(setUserId)
      .catch((err) => console.error("Failed to resolve user id:", err));
  }, []);

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
          const [flags, silent, checks, tallies, discovered] = await Promise.all([
            fetchConflictFlags(supabase, id),
            fetchSilentOutlets(supabase, id, story.first_seen_at),
            fetchFactChecks(supabase, id),
            fetchPollTallies(supabase, id),
            fetchDiscoveredArticles(supabase, id),
          ]);
          setConflictFlags(flags);
          setSilentOutlets(silent);
          setFactChecks(checks);
          setPollTallies(tallies);
          setDiscoveredArticles(discovered);
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

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} />;
  if (error || !story)
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
          Couldn't load story: {error}
        </Text>
      </View>
    );

  const flagsByOutlet = new Map(conflictFlags.map((f) => [f.outlet_id, f]));

  const framingSpectrum = pickFramingSpectrum(articles);

  return (
    <ScrollView style={{ backgroundColor: colors.background }}>
      {story.image_url ? (
        <Image
          source={{ uri: story.image_url }}
          style={{ width: "100%", height: 200, backgroundColor: colors.surfaceSubtle }}
          contentFit="cover"
        />
      ) : null}
      <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 20, fontFamily: fonts.headline, color: colors.textPrimary }}>
        {story.canonical_headline}
      </Text>
      {story.summary ? (
        <Text style={{ marginTop: 8, color: colors.textSecondary, fontFamily: fonts.ui }}>
          {story.summary}
        </Text>
      ) : null}
      <Pressable
        onPress={() => {
          const silentCount = silentOutlets.length;
          Share.share({
            message: buildShareText(
              { headline: story.canonical_headline ?? "This story", id: story.id },
              articles.length,
              silentCount
            ),
          }).catch((err) => console.error("Share failed:", err));
        }}
        style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Ionicons name="share-social-outline" size={16} color={colors.primary} />
        <Text style={{ color: colors.primary, fontFamily: fonts.uiSemiBold }}>Share this story</Text>
      </Pressable>
      {framingSpectrum.length === 2 ? (
        <View style={styles.sectionCard}>
          <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>Compare framing</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, fontFamily: fonts.ui }}>
            How the two most differently-scored outlets covering this story headlined it:
          </Text>
          {framingSpectrum.map((article) => (
            <Pressable
              key={article.id}
              onPress={() => Linking.openURL(article.url)}
              style={{ marginTop: 8 }}
            >
              <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
                {article.outlet?.name}
              </Text>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.ui }}>{article.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.sectionCard}>
      <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
        Sources ({articles.length})
      </Text>
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
            onPress={() => {
              Linking.openURL(article.url);
              // Fire-and-forget: recording the view/streak must never block
              // or interrupt actually opening the article, and a transient
              // failure here shouldn't surface as an error to the reader.
              if (userId && outlet) {
                recordArticleView(supabase, userId, story!.id, outlet.id)
                  .then(() => recomputeAndSaveStreak(supabase, userId))
                  .catch((err) => console.error("Failed to record view/streak:", err));
              }
            }}
            style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {outlet ? <OutletMark name={outlet.name} rssUrl={outlet.rss_url} /> : null}
              <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
                {outlet?.name ?? "Unknown outlet"}
              </Text>
              {outlet?.is_youtube ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 2,
                    backgroundColor: colors.red,
                    borderRadius: 8,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                  }}
                >
                  <Ionicons name="logo-youtube" size={11} color={colors.background} />
                  <Text style={{ fontSize: 10, color: colors.background, fontFamily: fonts.uiSemiBold }}>
                    YOUTUBE
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.ui }}>{article.title}</Text>
            {outlet?.ownership ? (
              <Text style={{ marginTop: 2, fontSize: 12, color: colors.textSecondary, fontFamily: fonts.ui }}>
                Owned by: {outlet.ownership.owner}
              </Text>
            ) : null}
            {outlet?.ownership?.citation_url ? (
              <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.ui }}>
                Source: {outlet.ownership.citation_url}
              </Text>
            ) : null}
            {outlet?.ownership?.note ? (
              <Text style={{ marginTop: 2, fontSize: 12, color: colors.textSecondary, fontFamily: fonts.ui }}>
                Press freedom note: {outlet.ownership.note}
                {outlet.ownership.note_citation_url
                  ? ` (source: ${outlet.ownership.note_citation_url})`
                  : ""}
              </Text>
            ) : null}
            {flag ? (
              <View style={{ flexDirection: "row", gap: 4, marginTop: 4, alignItems: "flex-start" }}>
                <Ionicons name="warning" size={13} color={colors.red} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 12, color: colors.red, fontFamily: fonts.ui }}>
                  Owner mentioned in this story ("{flag.matched_entity}"): {flag.evidence_text}
                </Text>
              </View>
            ) : null}
            {comparisons.length > 0 ? (
              <View style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.ui }}>
                  Compare coverage:
                </Text>
                {comparisons.map((comparisonArticle) => (
                  <Pressable
                    key={comparisonArticle.id}
                    onPress={(e) => {
                      e.stopPropagation();
                      Linking.openURL(comparisonArticle.url);
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2, fontFamily: fonts.ui }}>
                      {comparisonArticle.outlet?.name ?? "Unknown outlet"}: {comparisonArticle.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {hasScores ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {outlet?.govt_lean_score != null ? (
                  <View style={styles.scoreChip}>
                    <Ionicons name="business-outline" size={11} color={colors.textSecondary} />
                    <Text style={styles.scoreChipText}>Govt-lean {outlet.govt_lean_score}/100</Text>
                  </View>
                ) : null}
                {outlet?.sensationalism_score != null ? (
                  <View style={styles.scoreChip}>
                    <Ionicons name="flame-outline" size={11} color={colors.textSecondary} />
                    <Text style={styles.scoreChipText}>Sensationalism {outlet.sensationalism_score}/100</Text>
                  </View>
                ) : null}
                {outlet?.freedom_score != null ? (
                  <View style={styles.scoreChip}>
                    <Ionicons name="shield-checkmark-outline" size={11} color={colors.textSecondary} />
                    <Text style={styles.scoreChipText}>
                      {freedomLabel.replace(" (India baseline)", "")} {outlet.freedom_score}/100
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {govtLeanProvenance ? (
              <Text style={{ marginTop: 2, fontSize: 10, color: colors.textSecondary, fontFamily: fonts.ui }}>
                Govt-lean{govtLeanProvenance}
              </Text>
            ) : null}
            {outlet && shouldShowPoll(outlet) ? (
              <View style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: fonts.ui }}>
                  Did this outlet feel balanced covering this?
                  {pollTallies[outlet.id]?.total
                    ? ` (${Math.round(
                        (pollTallies[outlet.id].balanced / pollTallies[outlet.id].total) * 100
                      )}% of ${pollTallies[outlet.id].total} readers said balanced)`
                    : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                  {(["critical", "balanced", "friendly"] as const).map((option) => (
                    <Pressable
                      key={option}
                      onPress={(e) => {
                        e.stopPropagation();
                        handlePollResponse(outlet.id, option);
                      }}
                      style={{
                        backgroundColor: pollColors[option as PollResponse],
                        borderRadius: 12,
                        paddingVertical: 4,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: fonts.uiSemiBold, color: colors.background }}>
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      </View>
      {silentOutlets.length > 0 ? (
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="eye-off-outline" size={15} color={colors.textSecondary} />
            <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
              Not yet covered by {silentOutlets.length} outlet{silentOutlets.length === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {(showAllSilent ? silentOutlets : silentOutlets.slice(0, SILENT_PREVIEW_COUNT)).map((o) => (
              <View key={o.id} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <OutletMark name={o.name} rssUrl={o.rss_url} size={16} />
                <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: fonts.ui }}>
                  {o.name}
                </Text>
              </View>
            ))}
          </View>
          {silentOutlets.length > SILENT_PREVIEW_COUNT ? (
            <Pressable onPress={() => setShowAllSilent((prev) => !prev)} style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: colors.primary, fontFamily: fonts.uiSemiBold }}>
                {showAllSilent ? "Show less" : `Show all ${silentOutlets.length}`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {factChecks.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>Fact-checked</Text>
          {factChecks.map((factCheck, index) => (
            <Pressable
              key={`${factCheck.url}-${index}`}
              onPress={() => Linking.openURL(factCheck.url)}
              style={{ marginTop: 8 }}
            >
              <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
                {factCheck.source_org}
              </Text>
              <View
                style={{
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor:
                    verdictColors[factCheck.verdict as Verdict]?.background ?? colors.surfaceSubtle,
                }}
              >
                <Ionicons
                  name={VERDICT_ICONS[factCheck.verdict as Verdict] ?? "help-circle"}
                  size={13}
                  color={verdictColors[factCheck.verdict as Verdict]?.text ?? colors.textSecondary}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: fonts.uiSemiBold,
                    color: verdictColors[factCheck.verdict as Verdict]?.text ?? colors.textSecondary,
                  }}
                >
                  {factCheck.verdict.toUpperCase()}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: fonts.ui }}>
                {factCheck.claim}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {discoveredArticles.length > 0 ? (
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="search-outline" size={15} color={colors.textSecondary} />
            <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
              Also found via search
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.ui, marginTop: 2 }}>
            Not part of our vetted outlet list — unscored, shown for extra context only.
          </Text>
          {discoveredArticles.map((discovered) => (
            <Pressable
              key={discovered.id}
              onPress={() => Linking.openURL(discovered.url)}
              style={{ marginTop: 10 }}
            >
              <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary, fontSize: 13 }}>
                {discovered.outlet_name}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: fonts.ui }}>
                {discovered.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      </View>
    </ScrollView>
  );
}
