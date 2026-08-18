import { detectConflicts } from "./detectConflicts";

describe("detectConflicts", () => {
  it("flags an outlet whose owner alias appears in the story text", () => {
    const flags = detectConflicts(
      "Reliance Jio announces new tariff plans across India",
      [
        {
          outletId: "outlet-1",
          ownership: { owner: "Reliance Industries", owner_aliases: ["Reliance", "Jio"] },
        },
      ]
    );
    expect(flags).toEqual([
      {
        outletId: "outlet-1",
        matchedEntity: "Reliance",
        evidenceText: expect.stringContaining("Reliance Jio"),
      },
    ]);
  });

  it("does not flag an outlet with no ownership alias match", () => {
    const flags = detectConflicts("Farm bill repealed in Parliament", [
      {
        outletId: "outlet-1",
        ownership: { owner: "Reliance Industries", owner_aliases: ["Reliance", "Jio"] },
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
    const flags = detectConflicts("Reliance and Jio both announced results", [
      {
        outletId: "outlet-1",
        ownership: { owner: "Reliance Industries", owner_aliases: ["Reliance", "Jio"] },
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
});
