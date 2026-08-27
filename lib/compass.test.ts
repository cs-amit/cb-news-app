import { QUIZ_QUESTIONS, scoreQuizAnswers } from "./compass";

describe("QUIZ_QUESTIONS", () => {
  it("has 6 questions with unique ids", () => {
    expect(QUIZ_QUESTIONS).toHaveLength(6);
    const ids = new Set(QUIZ_QUESTIONS.map((q) => q.id));
    expect(ids.size).toBe(6);
  });
});

describe("scoreQuizAnswers", () => {
  function answersOf(value: number): Record<string, number> {
    const answers: Record<string, number> = {};
    for (const q of QUIZ_QUESTIONS) answers[q.id] = value;
    return answers;
  }

  it("scores all-neutral answers as 0", () => {
    expect(scoreQuizAnswers(answersOf(0))).toBe(0);
  });

  it("scores maximum agreement, direction-adjusted, as +100", () => {
    const answers: Record<string, number> = {};
    for (const q of QUIZ_QUESTIONS) answers[q.id] = 2 * q.direction;
    expect(scoreQuizAnswers(answers)).toBe(100);
  });

  it("scores maximum disagreement, direction-adjusted, as -100", () => {
    const answers: Record<string, number> = {};
    for (const q of QUIZ_QUESTIONS) answers[q.id] = -2 * q.direction;
    expect(scoreQuizAnswers(answers)).toBe(-100);
  });

  it("ignores unanswered questions rather than treating them as 0", () => {
    const partial: Record<string, number> = { [QUIZ_QUESTIONS[0].id]: 2 * QUIZ_QUESTIONS[0].direction };
    expect(scoreQuizAnswers(partial)).toBeGreaterThan(0);
  });

  it("clamps to the [-100, 100] range", () => {
    const answers: Record<string, number> = {};
    for (const q of QUIZ_QUESTIONS) answers[q.id] = 2 * q.direction;
    const score = scoreQuizAnswers(answers);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(-100);
  });
});
