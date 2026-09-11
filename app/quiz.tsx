import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import { QUIZ_QUESTIONS, scoreQuizAnswers } from "../lib/compass";
import { setCompassPosition, fetchOwnPollResponses } from "../lib/queries";
import { computeCompassDistribution, CompassDistribution } from "../lib/compassStats";
import { Ionicons } from "@expo/vector-icons";
import { CompassGauge, CompassDistributionBar } from "../components/CompassGauge";
import { Button } from "../components/Button";
import { colors, fonts, pollColors } from "../lib/theme";

function zoneLabel(position: number): { label: string; color: string } {
  if (position <= -33.3) return { label: "Critical zone", color: pollColors.critical };
  if (position >= 33.3) return { label: "Friendly zone", color: pollColors.friendly };
  return { label: "Balanced zone", color: pollColors.balanced };
}

const LIKERT_OPTIONS: { label: string; value: number }[] = [
  { label: "Strongly disagree", value: -2 },
  { label: "Disagree", value: -1 },
  { label: "Neutral", value: 0 },
  { label: "Agree", value: 1 },
  { label: "Strongly agree", value: 2 },
];

export default function QuizScreen() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [resultPosition, setResultPosition] = useState<number | null>(null);
  const [distribution, setDistribution] = useState<CompassDistribution | null>(null);

  const allAnswered = QUIZ_QUESTIONS.every((q) => typeof answers[q.id] === "number");

  async function handleSubmit() {
    setStatus("submitting");
    const position = scoreQuizAnswers(answers);
    try {
      const userId = await getUserId(supabase);
      await setCompassPosition(supabase, userId, position);
      // A retaken quiz can follow an existing poll-answer history — show it
      // alongside the fresh position rather than pretending it's day one.
      const responses = await fetchOwnPollResponses(supabase, userId);
      setDistribution(computeCompassDistribution(responses));
    } catch (err) {
      console.error("Failed to save compass position:", err);
    }
    setResultPosition(position);
    setStatus("done");
  }

  if (status === "done" && resultPosition !== null) {
    const zone = zoneLabel(resultPosition);
    return (
      <View style={{ padding: 16, backgroundColor: colors.background, flex: 1 }}>
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: zone.color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="compass" size={30} color={colors.background} />
          </View>
          <Text
            style={{ marginTop: 12, fontSize: 22, fontFamily: fonts.headline, color: colors.textPrimary }}
          >
            You're in the {zone.label}
          </Text>
        </View>
        <View
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <CompassGauge position={resultPosition} />
          {distribution ? <CompassDistributionBar distribution={distribution} /> : null}
        </View>
        <Text
          style={{
            marginTop: 16,
            fontFamily: fonts.ui,
            color: colors.textSecondary,
            textAlign: "center",
          }}
        >
          This is a badge, not a filter — it never changes which stories or outlets you see.
        </Text>
        <Button label="Done" onPress={() => router.back()} style={{ marginTop: 20 }} />
      </View>
    );
  }

  const answeredCount = QUIZ_QUESTIONS.filter((q) => typeof answers[q.id] === "number").length;

  return (
    <ScrollView style={{ padding: 16, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 18, fontFamily: fonts.headline, color: colors.textPrimary }}>
        Where do you stand?
      </Text>
      <Text style={{ marginTop: 8, fontFamily: fonts.ui, color: colors.textSecondary }}>
        This never changes what you're shown — it's a badge for your profile, not a filter.
      </Text>
      <View style={{ marginTop: 16, gap: 4 }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceSubtle, overflow: "hidden" }}>
          <View
            style={{
              height: "100%",
              width: `${(answeredCount / QUIZ_QUESTIONS.length) * 100}%`,
              backgroundColor: colors.primary,
            }}
          />
        </View>
        <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.ui }}>
          {answeredCount} of {QUIZ_QUESTIONS.length} answered
        </Text>
      </View>
      {QUIZ_QUESTIONS.map((q) => (
        <View
          key={q.id}
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: answers[q.id] !== undefined ? colors.primary : colors.border,
          }}
        >
          <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>{q.statement}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {LIKERT_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: option.value }))}
                style={{
                  borderWidth: 1,
                  borderColor: answers[q.id] === option.value ? colors.primary : colors.border,
                  borderRadius: 16,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  backgroundColor: answers[q.id] === option.value ? colors.primary : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: fonts.ui,
                    color: answers[q.id] === option.value ? colors.background : colors.textPrimary,
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Button
        label="See my position"
        onPress={handleSubmit}
        disabled={!allAnswered}
        loading={status === "submitting"}
        style={{ marginTop: 24, marginBottom: 40 }}
      />
    </ScrollView>
  );
}
