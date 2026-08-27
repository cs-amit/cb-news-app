export interface QuizQuestion {
  id: string;
  statement: string;
  // +1: agreeing shifts the position toward +100 (government-friendly).
  // -1: agreeing shifts the position toward -100 (government-critical).
  direction: 1 | -1;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "scrutiny-in-crisis",
    statement: "The press should scrutinize government decisions even during a national crisis.",
    direction: -1,
  },
  {
    id: "spokesperson-accuracy",
    statement:
      "Government spokespersons generally give a more accurate account of events than independent reporters.",
    direction: 1,
  },
  {
    id: "challenging-officials",
    statement: "Journalists who challenge official statements are performing a valuable public service.",
    direction: -1,
  },
  {
    id: "restraint-for-unity",
    statement:
      "In the interest of national unity, the press should sometimes hold back criticism of the government.",
    direction: 1,
  },
  {
    id: "investigative-reporting",
    statement: "Investigative reporting that embarrasses the government ultimately strengthens democracy.",
    direction: -1,
  },
  {
    id: "trust-when-aligned",
    statement: "I trust a news outlet more when its coverage aligns with the government's version of events.",
    direction: 1,
  },
];

// Each answer is a Likert value in [-2, 2] (strongly disagree..strongly
// agree). Unanswered questions are skipped rather than counted as neutral,
// so the average is only ever taken over questions the user actually
// answered.
export function scoreQuizAnswers(answers: Record<string, number>): number {
  let total = 0;
  let count = 0;
  for (const q of QUIZ_QUESTIONS) {
    const value = answers[q.id];
    if (typeof value !== "number") continue;
    total += value * q.direction;
    count += 1;
  }
  if (count === 0) return 0;
  const avg = total / count; // range [-2, 2]
  const scaled = Math.round(avg * 50); // range [-100, 100]
  return Math.max(-100, Math.min(100, scaled));
}
