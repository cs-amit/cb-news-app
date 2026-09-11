import { DEMO_PERSONAS, buildPersonaListPlan } from "./demoPersonas";

describe("DEMO_PERSONAS", () => {
  it("spans all three compass zones with distinct handles", () => {
    const positions = DEMO_PERSONAS.map((p) => p.compassPosition);
    expect(positions.some((p) => p <= -33.3)).toBe(true); // critical
    expect(positions.some((p) => p > -33.3 && p < 33.3)).toBe(true); // balanced
    expect(positions.some((p) => p >= 33.3)).toBe(true); // friendly

    const handles = DEMO_PERSONAS.map((p) => p.handle);
    expect(new Set(handles).size).toBe(handles.length);
  });
});

describe("buildPersonaListPlan", () => {
  it("assigns each persona a distinct, non-overlapping slice of story ids", () => {
    const storyIds = Array.from({ length: DEMO_PERSONAS.length * 3 }, (_, i) => `story-${i}`);

    const plan = buildPersonaListPlan(storyIds, DEMO_PERSONAS, 3);

    expect(plan).toHaveLength(DEMO_PERSONAS.length);
    const allAssigned = plan.flatMap((p) => p.storyIds);
    expect(new Set(allAssigned).size).toBe(allAssigned.length); // no overlap
    for (const p of plan) expect(p.storyIds).toHaveLength(3);
  });

  it("gives a persona fewer stories rather than failing when the pool runs short", () => {
    const storyIds = ["story-0", "story-1"]; // fewer than personas * 3
    const plan = buildPersonaListPlan(storyIds, DEMO_PERSONAS.slice(0, 1), 3);

    expect(plan[0].storyIds).toEqual(["story-0", "story-1"]);
  });

  it("gives a persona zero stories, not an error, when the pool is empty", () => {
    const plan = buildPersonaListPlan([], DEMO_PERSONAS.slice(0, 1), 3);
    expect(plan[0].storyIds).toEqual([]);
  });
});
