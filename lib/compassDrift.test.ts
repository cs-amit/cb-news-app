import { computeDrift, DriftState } from "./compassDrift";

const START_OF_WEEK = new Date("2026-08-26T00:00:00Z");

function stateAt(position: number, weekStartedAt: Date, weekDelta = 0): DriftState {
  return { position, weekStartedAt: weekStartedAt.toISOString(), weekDelta };
}

describe("computeDrift", () => {
  it("nudges toward the friendly target by a small step from a fresh week", () => {
    const result = computeDrift(stateAt(0, START_OF_WEEK), "friendly", START_OF_WEEK);
    expect(result.position).toBeCloseTo(2, 5); // 0.02 * (100 - 0) = 2
    expect(result.weekDelta).toBeCloseTo(2, 5);
  });

  it("nudges toward the critical target", () => {
    const result = computeDrift(stateAt(0, START_OF_WEEK), "critical", START_OF_WEEK);
    expect(result.position).toBeCloseTo(-2, 5);
  });

  it("nudges toward 0 for a balanced answer, pulling an extreme position back toward center", () => {
    const result = computeDrift(stateAt(80, START_OF_WEEK), "balanced", START_OF_WEEK);
    expect(result.position).toBeLessThan(80);
    expect(result.position).toBeCloseTo(78.4, 5); // 80 + 0.02 * (0 - 80) = 78.4
  });

  it("caps cumulative movement at the weekly cap even across multiple answers", () => {
    let state = stateAt(0, START_OF_WEEK);
    for (let i = 0; i < 10; i++) {
      state = computeDrift(state, "friendly", START_OF_WEEK);
    }
    expect(state.weekDelta).toBeCloseTo(3, 5); // WEEKLY_CAP
    expect(state.position).toBeCloseTo(3, 5);
  });

  it("applies zero further movement once the weekly cap is fully used", () => {
    const atCap = stateAt(3, START_OF_WEEK, 3);
    const result = computeDrift(atCap, "friendly", START_OF_WEEK);
    expect(result.position).toBe(3);
    expect(result.weekDelta).toBe(3);
  });

  it("treats an unparseable week-start timestamp as an expired week (fresh start)", () => {
    const corrupt: DriftState = { position: 3, weekStartedAt: "not-a-date", weekDelta: 3 };
    const result = computeDrift(corrupt, "friendly", START_OF_WEEK);
    expect(result.weekStartedAt).toBe(START_OF_WEEK.toISOString());
    expect(result.weekDelta).toBeCloseTo(1.94, 2); // 0.02 * (100 - 3), fresh cap despite weekDelta was 3
    expect(result.position).toBeGreaterThan(3);
  });

  it("resets the weekly cap once a new week has started", () => {
    const staleWeek = new Date(START_OF_WEEK.getTime() - 8 * 24 * 60 * 60 * 1000);
    const atCap = stateAt(3, staleWeek, 3);
    const result = computeDrift(atCap, "friendly", START_OF_WEEK);
    expect(result.weekStartedAt).toBe(START_OF_WEEK.toISOString());
    expect(result.weekDelta).toBeCloseTo(1.94, 2); // 0.02 * (100 - 3) = 1.94, fresh cap
    expect(result.position).toBeGreaterThan(3);
  });
});
