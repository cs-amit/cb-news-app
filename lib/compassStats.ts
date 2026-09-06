import { PollResponseForDrift } from "./compassDrift";

export interface CompassDistribution {
  critical: number;
  balanced: number;
  friendly: number;
  /** Raw count backing the percentages — the "based on N poll answers" line. */
  total: number;
}

/** Breaks down a user's own poll answers by type, as percentages of their total. */
export function computeCompassDistribution(
  responses: PollResponseForDrift[]
): CompassDistribution {
  const total = responses.length;
  if (total === 0) return { critical: 0, balanced: 0, friendly: 0, total: 0 };
  const counts = { critical: 0, balanced: 0, friendly: 0 };
  for (const r of responses) counts[r] += 1;
  return {
    critical: Math.round((counts.critical / total) * 100),
    balanced: Math.round((counts.balanced / total) * 100),
    friendly: Math.round((counts.friendly / total) * 100),
    total,
  };
}
