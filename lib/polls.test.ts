import { shouldShowPoll } from "./polls";

describe("shouldShowPoll", () => {
  it("shows the poll for an outlet with no govt-lean score", () => {
    expect(shouldShowPoll({ govt_lean_score: null, is_youtube: false })).toBe(true);
  });

  it("shows the poll for a YouTube outlet even if scored", () => {
    expect(shouldShowPoll({ govt_lean_score: 40, is_youtube: true })).toBe(true);
  });

  it("hides the poll for a non-YouTube outlet that already has a score", () => {
    expect(shouldShowPoll({ govt_lean_score: 40, is_youtube: false })).toBe(false);
  });
});
