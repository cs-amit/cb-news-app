import { computeSilentOutlets, OutletSummary } from "./silence";

const OUTLETS: OutletSummary[] = [
  { id: "o1", name: "A", is_youtube: false },
  { id: "o2", name: "B", is_youtube: false },
  { id: "o3", name: "C", is_youtube: true },
];

describe("computeSilentOutlets", () => {
  it("returns outlets that are active but did not cover the story, once the lag guard has passed", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const firstSeen = "2026-08-18T12:00:00Z"; // 24h old
    const result = computeSilentOutlets(OUTLETS, new Set(["o1"]), firstSeen, now);
    expect(result.map((o) => o.id)).toEqual(["o2", "o3"]);
  });

  it("returns an empty array when the story is younger than the lag guard", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const firstSeen = "2026-08-19T06:00:00Z"; // 6h old
    const result = computeSilentOutlets(OUTLETS, new Set(["o1"]), firstSeen, now);
    expect(result).toEqual([]);
  });

  it("returns an empty array when every active outlet covered the story", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const firstSeen = "2026-08-18T12:00:00Z";
    const result = computeSilentOutlets(OUTLETS, new Set(["o1", "o2", "o3"]), firstSeen, now);
    expect(result).toEqual([]);
  });

  it("defaults `now` to the current time when not provided", () => {
    const oldFirstSeen = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = computeSilentOutlets(OUTLETS, new Set(["o1", "o2", "o3"]), oldFirstSeen);
    expect(result).toEqual([]);
  });
});
