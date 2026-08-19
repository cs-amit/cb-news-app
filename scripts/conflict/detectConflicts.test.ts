import { detectConflicts } from "./detectConflicts";

describe("detectConflicts", () => {
  it("flags an outlet whose owner alias appears in the story text", () => {
    const flags = detectConflicts(
      "Reliance Jio announces new tariff plans across India",
      [
        {
          outletId: "outlet-1",
          ownership: { owner: "Reliance Industries", owner_aliases: ["Reliance Industries", "Jio"] },
        },
      ]
    );
    expect(flags).toEqual([
      {
        outletId: "outlet-1",
        matchedEntity: "Jio",
        evidenceText: expect.stringContaining("Reliance Jio"),
      },
    ]);
  });

  it("does not flag an outlet with no ownership alias match", () => {
    const flags = detectConflicts("Farm bill repealed in Parliament", [
      {
        outletId: "outlet-1",
        ownership: { owner: "Reliance Industries", owner_aliases: ["Reliance Industries", "Jio"] },
      },
    ]);
    expect(flags).toEqual([]);
  });

  it("skips outlets with no ownership record", () => {
    const flags = detectConflicts("Reliance Jio news", [{ outletId: "outlet-1", ownership: null }]);
    expect(flags).toEqual([]);
  });

  it("falls back to matching the bare owner name when no alias list is given", () => {
    const flags = detectConflicts("Adani Group wins new port contract", [
      { outletId: "outlet-1", ownership: { owner: "Adani Group" } },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0].matchedEntity).toBe("Adani Group");
  });

  it("only produces one flag per outlet even if multiple aliases match", () => {
    const flags = detectConflicts("Reliance Industries and Jio both announced results", [
      {
        outletId: "outlet-1",
        ownership: { owner: "Reliance Industries", owner_aliases: ["Reliance Industries", "Jio"] },
      },
    ]);
    expect(flags).toHaveLength(1);
  });

  it("matches case-insensitively", () => {
    const flags = detectConflicts("ADANI wins contract", [
      { outletId: "outlet-1", ownership: { owner: "Adani Group", owner_aliases: ["Adani"] } },
    ]);
    expect(flags).toHaveLength(1);
  });

  it("does not flag an alias that only appears inside a longer unrelated word", () => {
    // A flag is a public conflict-of-interest accusation against a named
    // outlet, so "Sun" must not match the "Sun" in "Sundar".
    const flags = detectConflicts("Sundar Pichai testifies before a parliamentary panel", [
      { outletId: "outlet-1", ownership: { owner: "Sun Group", owner_aliases: ["Sun"] } },
    ]);
    expect(flags).toEqual([]);
  });

  it("still matches the same alias when it appears as a whole word", () => {
    const flags = detectConflicts("Sun Group buys a stake in a regional broadcaster", [
      { outletId: "outlet-1", ownership: { owner: "Sun Group", owner_aliases: ["Sun"] } },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0].matchedEntity).toBe("Sun");
  });
});
