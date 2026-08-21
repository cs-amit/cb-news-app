import { computeStreak, computeSidesSeenTotal, ViewRow } from "./streak";

function view(story: string, outlet: string, date: string): ViewRow {
  return { story_id: story, outlet_id: outlet, viewed_at: `${date}T10:00:00Z` };
}

describe("computeStreak", () => {
  it("counts consecutive days ending today where 2+ outlets were seen on one story", () => {
    const rows = [
      view("s1", "a", "2026-08-19"),
      view("s1", "b", "2026-08-19"),
      view("s2", "a", "2026-08-20"),
      view("s2", "b", "2026-08-20"),
      view("s3", "a", "2026-08-21"),
      view("s3", "b", "2026-08-21"),
    ];
    const streak = computeStreak(rows, new Date("2026-08-21T18:00:00Z"));
    expect(streak).toBe(3);
  });

  it("does not count a day where only one outlet was seen on any story", () => {
    const rows = [view("s1", "a", "2026-08-20"), view("s2", "a", "2026-08-21")];
    const streak = computeStreak(rows, new Date("2026-08-21T18:00:00Z"));
    expect(streak).toBe(0);
  });

  it("still counts today's partial progress from yesterday, if today has no comparison yet", () => {
    const rows = [view("s1", "a", "2026-08-20"), view("s1", "b", "2026-08-20")];
    const streak = computeStreak(rows, new Date("2026-08-21T09:00:00Z"));
    expect(streak).toBe(1);
  });

  it("breaks the streak across a gap day", () => {
    const rows = [
      view("s1", "a", "2026-08-18"),
      view("s1", "b", "2026-08-18"),
      view("s2", "a", "2026-08-21"),
      view("s2", "b", "2026-08-21"),
    ];
    const streak = computeStreak(rows, new Date("2026-08-21T18:00:00Z"));
    expect(streak).toBe(1);
  });

  it("returns 0 for no view history", () => {
    expect(computeStreak([], new Date("2026-08-21T18:00:00Z"))).toBe(0);
  });

  it("counts two outlets on different stories on the same day as two separate non-comparison events, not one", () => {
    const rows = [view("s1", "a", "2026-08-21"), view("s2", "b", "2026-08-21")];
    const streak = computeStreak(rows, new Date("2026-08-21T18:00:00Z"));
    expect(streak).toBe(0);
  });
});

describe("computeSidesSeenTotal", () => {
  it("counts distinct (story, outlet) pairs, ignoring duplicate views", () => {
    const rows = [
      view("s1", "a", "2026-08-19"),
      view("s1", "a", "2026-08-20"), // same story+outlet, different day — not a new side
      view("s1", "b", "2026-08-19"),
      view("s2", "a", "2026-08-19"),
    ];
    expect(computeSidesSeenTotal(rows)).toBe(3);
  });

  it("returns 0 for no view history", () => {
    expect(computeSidesSeenTotal([])).toBe(0);
  });
});
