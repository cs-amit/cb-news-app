import { buildShareText } from "./shareCopy";

describe("buildShareText", () => {
  it("includes the headline and source count", () => {
    const text = buildShareText({ headline: "Farm bill repealed" }, 9, 2);
    expect(text).toContain("Farm bill repealed");
    expect(text).toContain("9");
  });

  it("mentions the silence count when outlets are silent", () => {
    const text = buildShareText({ headline: "Farm bill repealed" }, 9, 2);
    expect(text).toMatch(/2 outlets/i);
  });

  it("omits any silence mention when nothing is silent", () => {
    const text = buildShareText({ headline: "Farm bill repealed" }, 9, 0);
    expect(text).not.toMatch(/silent|haven'?t/i);
  });

  it("mentions the app name so the forward is identifiable", () => {
    const text = buildShareText({ headline: "Farm bill repealed" }, 9, 0);
    expect(text).toMatch(/sourced/i);
  });

  it("never throws the ethical-copy guard for its own output", () => {
    expect(() => buildShareText({ headline: "Any story" }, 3, 1)).not.toThrow();
  });
});
