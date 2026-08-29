export interface DriftState {
  position: number;
  weekStartedAt: string;
  weekDelta: number;
}

export type PollResponseForDrift = "critical" | "balanced" | "friendly";

// Small enough that a single answer never meaningfully moves the badge;
// the weekly cap below is the actual "moves slowly" guarantee.
const DRIFT_WEIGHT = 0.02;

// Total absolute movement allowed per rolling week, regardless of how many
// poll answers land in that week.
const WEEKLY_CAP = 3;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const TARGETS: Record<PollResponseForDrift, number> = {
  critical: -100,
  balanced: 0,
  friendly: 100,
};

export function computeDrift(state: DriftState, response: PollResponseForDrift, now: Date): DriftState {
  const nowMs = now.getTime();
  const weekStartMs = new Date(state.weekStartedAt).getTime();
  const weekExpired = !state.weekStartedAt || nowMs - weekStartMs >= WEEK_MS;

  const weekStartedAt = weekExpired ? now.toISOString() : state.weekStartedAt;
  const weekDeltaSoFar = weekExpired ? 0 : state.weekDelta;

  const remainingCap = WEEKLY_CAP - weekDeltaSoFar;
  if (remainingCap <= 0) {
    return { position: state.position, weekStartedAt, weekDelta: weekDeltaSoFar };
  }

  const target = TARGETS[response];
  const proposedDelta = DRIFT_WEIGHT * (target - state.position);
  const cappedMagnitude = Math.min(Math.abs(proposedDelta), remainingCap);
  const cappedDelta = Math.sign(proposedDelta) * cappedMagnitude;

  return {
    position: state.position + cappedDelta,
    weekStartedAt,
    weekDelta: weekDeltaSoFar + Math.abs(cappedDelta),
  };
}
