import { buildShareText } from "./shareCopy";

describe("buildShareText", () => {
  it("includes the headline and source count", () => {
    const text = buildShareText({ headline: "Farm bill repealed", id: "story-1" }, 9, 2);
    expect(text).toContain("Farm bill repealed");
    expect(text).toContain("9");
  });

  it("mentions the silence count when outlets are silent", () => {
    const text = buildShareText({ headline: "Farm bill repealed", id: "story-1" }, 9, 2);
    expect(text).toMatch(/2 outlets/i);
  });

  it("omits any silence mention when nothing is silent", () => {
    const text = buildShareText({ headline: "Farm bill repealed", id: "story-1" }, 9, 0);
    expect(text).not.toMatch(/silent|haven'?t/i);
  });

  it("mentions the app name so the forward is identifiable", () => {
    const text = buildShareText({ headline: "Farm bill repealed", id: "story-1" }, 9, 0);
    expect(text).toMatch(/sourced/i);
  });

  it("never throws the ethical-copy guard for its own output", () => {
    expect(() => buildShareText({ headline: "Any story", id: "story-1" }, 3, 1)).not.toThrow();
  });

  it("does not throw for a real headline containing a banned word", () => {
    // Regression for the Critical finding: assertEthicalCopy was previously
    // called AFTER the headline was interpolated into the share text, so an
    // ordinary headline containing "warning" (very common in Indian weather/
    // civic reporting) crashed the share flow before Share.share() was even
    // called.
    const headline = "IMD issues heavy rain warning for coastal Karnataka";
    let text = "";
    expect(() => {
      text = buildShareText({ headline, id: "story-1" }, 5, 1);
    }).not.toThrow();
    expect(text).toContain(headline);
  });

  it("includes a deep link to the story so the share is actually followable", () => {
    const text = buildShareText({ headline: "Farm bill repealed", id: "story-42" }, 9, 0);
    expect(text).toContain("sourced://story/story-42");
  });
});
