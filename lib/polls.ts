export function shouldShowPoll(outlet: { govt_lean_score: number | null; is_youtube: boolean }): boolean {
  return outlet.govt_lean_score === null || outlet.is_youtube;
}

export type PollResponseValue = "critical" | "balanced" | "friendly";
