import { computeCompassDistribution } from "./compassStats";

describe("computeCompassDistribution", () => {
  it("returns percentages and total for a mix of responses", () => {
    const result = computeCompassDistribution([
      "critical",
      "critical",
      "balanced",
      "friendly",
      "friendly",
    ]);
    expect(result).toEqual({ critical: 40, balanced: 20, friendly: 40, total: 5 });
  });

  it("returns all zeros with total 0 for no responses", () => {
    expect(computeCompassDistribution([])).toEqual({
      critical: 0,
      balanced: 0,
      friendly: 0,
      total: 0,
    });
  });

  it("returns 100% for a single response type", () => {
    expect(computeCompassDistribution(["balanced", "balanced"])).toEqual({
      critical: 0,
      balanced: 100,
      friendly: 0,
      total: 2,
    });
  });
});
