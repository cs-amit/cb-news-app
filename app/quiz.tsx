import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import { QUIZ_QUESTIONS, scoreQuizAnswers } from "../lib/compass";
import { setCompassPosition } from "../lib/queries";
import { colors, fonts } from "../lib/theme";

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

  const allAnswered = QUIZ_QUESTIONS.every((q) => typeof answers[q.id] === "number");

  async function handleSubmit() {
    setStatus("submitting");
    const position = scoreQuizAnswers(answers);
    try {
      const userId = await getUserId(supabase);
      await setCompassPosition(supabase, userId, position);
    } catch (err) {
      console.error("Failed to save compass position:", err);
    }
    setResultPosition(position);
    setStatus("done");
  }

  if (status === "done" && resultPosition !== null) {
    return (
      <View style={{ padding: 16, backgroundColor: colors.background, flex: 1 }}>
        <Text style={{ fontSize: 18, fontFamily: fonts.headline, color: colors.textPrimary }}>
          Your position: {resultPosition}
        </Text>
        <Text style={{ marginTop: 8, fontFamily: fonts.ui, color: colors.textSecondary }}>
          -100 is government-critical, +100 is government-friendly. This is a badge, not a filter
          — it never changes which stories or outlets you see.
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.primary }}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={{ padding: 16, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 18, fontFamily: fonts.headline, color: colors.textPrimary }}>
        Where do you stand?
      </Text>
      <Text style={{ marginTop: 8, fontFamily: fonts.ui, color: colors.textSecondary }}>
        This never changes what you're shown — it's a badge for your profile, not a filter.
      </Text>
      {QUIZ_QUESTIONS.map((q) => (
        <View key={q.id} style={{ marginTop: 20 }}>
          <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>{q.statement}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {LIKERT_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: option.value }))}
                style={{
                  borderWidth: 1,
                  borderColor: answers[q.id] === option.value ? colors.primary : colors.border,
                  borderRadius: 4,
                  padding: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.ui,
                    color: answers[q.id] === option.value ? colors.primary : colors.textPrimary,
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Pressable
        onPress={handleSubmit}
        disabled={!allAnswered || status === "submitting"}
        style={{ marginTop: 24, marginBottom: 40 }}
      >
        <Text
          style={{
            fontFamily: fonts.uiSemiBold,
            color: allAnswered ? colors.primary : colors.textSecondary,
          }}
        >
          {status === "submitting" ? "Saving..." : "See my position"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
