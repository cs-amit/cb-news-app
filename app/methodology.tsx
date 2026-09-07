import { useEffect, useState } from "react";
import { ScrollView, Text, View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { fetchMethodologyStats, MethodologyStats } from "../lib/queries";
import { colors, fonts } from "../lib/theme";

function SectionHeading({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20 }}>
      <Ionicons name={icon} size={17} color={colors.primary} />
      <Text style={{ fontSize: 16, fontFamily: fonts.headline, color: colors.textPrimary }}>{title}</Text>
    </View>
  );
}

export default function MethodologyScreen() {
  const [stats, setStats] = useState<MethodologyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMethodologyStats(supabase)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ScrollView style={{ padding: 16, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 20, fontFamily: fonts.headline, color: colors.textPrimary }}>
        Methodology
      </Text>

      <SectionHeading icon="business-outline" title="Ownership" />
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        Ownership data is curated from public sources (Wikipedia and press reporting) and every claim
        carries a citation, shown on each outlet's badge. Wording is kept
        neutral ("owned by") — we never use loaded terms like "controlled by" or "mouthpiece."
      </Text>

      <SectionHeading icon="warning-outline" title="Conflict-of-interest flags" />
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        A story is flagged for a covering outlet when the story's text mentions that outlet's owner (or a
        known alias, e.g. a parent company or controlling individual). This is a deterministic text match
        against the ownership dataset above, not an AI judgment call — the matched phrase and surrounding
        text are shown as evidence on each flag.
      </Text>

      <SectionHeading icon="shield-outline" title="Press freedom" />
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        Every outlet starts from a shared baseline of 32/100, derived from RSF's World Press Freedom Index
        score for India (31.96/100, rank 157 of 180, 2026 — rsf.org/en/country/india). A small number of
        outlets carry a documented, citable press-freedom incident specific to that outlet (e.g. a raid, an
        ownership change reported as an editorial-independence concern, or a journalist's arrest tied to
        their reporting); those outlets are scored 22/100, with the incident and citation shown on the
        outlet's badge. This is a flat, binary adjustment rather than a severity ranking, which would
        require editorial judgment this solo build has no way to validate.
      </Text>

      <SectionHeading icon="stats-chart-outline" title="Govt-lean & sensationalism scores" />
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        Both scores come from sampling up to 20 of an outlet's most recent headlines and sending them to
        Gemini (gemini-flash-latest) in a single batched request covering every eligible outlet at once,
        run once daily. Govt-lean runs 0 (consistently government-critical) to 100 (consistently
        government-friendly); sensationalism runs 0 (plain, factual) to 100 (highly sensational). An outlet
        needs at least 5 sampled headlines before it gets a score, and every score shows its sample size
        and last-updated date.
        {stats
          ? ` As of the last run: ${stats.scoredOutletCount} of ${
              stats.outletCount + stats.youtubeCount
            } outlets scored${
              stats.lastScoredAt
                ? `, most recently on ${new Date(stats.lastScoredAt).toLocaleDateString()}`
                : ""
            }.`
          : ""}
      </Text>

      <SectionHeading icon="eye-off-outline" title="Silence signal" />
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        A story only lists outlets as "not yet covered by" once it's at least 18 hours old — this guards
        against false positives from normal RSS polling delay, not every outlet failing to cover a story
        within the first hour. An outlet only counts as active (and therefore eligible to be flagged
        silent) if it has published at least one article in the trailing 7 days.
      </Text>

      <SectionHeading icon="logo-youtube" title="YouTube-lite inclusion criteria" />
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        Channels were selected to span the full range of editorial relationships to India's central
        government — from independent, non-corporate creators whose journalists have publicly described
        facing pressure or resigned over editorial-independence concerns, to channels owned by conglomerates
        or individuals with documented political affiliations or government regulatory advisories, to wire
        services and mainstream broadcasters with no strong documented lean. Every channel had to be
        primarily a news or current-affairs outlet — general, political, or business/economic — rather than
        entertainment or lifestyle content, and had to maintain an active public RSS feed. Ownership,
        editorial leadership, and any documented lean are sourced from Wikipedia or mainstream press
        reporting, not this app's own editorial judgment, and are cited per channel. This list is not exhaustive and will be revisited periodically; inclusion is not an
        endorsement or condemnation of any channel.
      </Text>

      <SectionHeading icon="compass-outline" title="Political compass" />
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        Your compass position (from the quiz on your profile) never changes which stories or
        outlets you're shown. It's a badge you can choose to share, not a filter — this app
        doesn't personalize your feed based on it. It also only moves in small steps over time,
        driven by your own outlet-poll answers, never by which articles you happen to read.
      </Text>

      {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : null}
    </ScrollView>
  );
}
