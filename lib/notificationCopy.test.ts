import { assertEthicalCopy, buildDailyDigestCopy } from "./notificationCopy";

describe("assertEthicalCopy", () => {
  it("does not throw for neutral, informational copy", () => {
    expect(() =>
      assertEthicalCopy("Today's top story has 9 sources, and 2 outlets are silent on it.")
    ).not.toThrow();
  });

  it.each([
    "Don't lose your streak!",
    "You'll lose your progress if you don't open the app today.",
    "See what they're hiding.",
    "Last chance to keep your streak alive.",
    "Warning: your streak is at risk.",
    "Don't miss out on today's top story.",
  ])("throws for loss-framed or fear-framed copy: %s", (badCopy) => {
    expect(() => assertEthicalCopy(badCopy)).toThrow(/ethical nudge charter/i);
  });
});

describe("buildDailyDigestCopy", () => {
  it("produces promotion-framed copy naming the source and silence counts", () => {
    const { title, body } = buildDailyDigestCopy({
      topStoryHeadline: "Farm bill repealed",
      sourceCount: 9,
      silentCount: 2,
    });
    expect(title).toBeTruthy();
    expect(body).toContain("Farm bill repealed");
    expect(body).toContain("9");
    expect(body).toContain("2");
  });

  it("omits the silence clause entirely when no outlet is silent", () => {
    const { body } = buildDailyDigestCopy({
      topStoryHeadline: "Farm bill repealed",
      sourceCount: 9,
      silentCount: 0,
    });
    expect(body).not.toMatch(/silent|haven'?t/i);
  });

  it("passes its own output through the ethical-copy guard without throwing", () => {
    expect(() =>
      buildDailyDigestCopy({ topStoryHeadline: "Any story", sourceCount: 3, silentCount: 1 })
    ).not.toThrow();
  });

  it("does not throw for a real top-story headline containing a banned word", () => {
    // Regression for the Critical finding: assertEthicalCopy was previously
    // called AFTER stats.topStoryHeadline was interpolated into the body, so
    // an ordinary headline containing "warning" crashed digest rescheduling
    // (silently, since app/index.tsx's rescheduleDigest swallows the error).
    const topStoryHeadline = "IMD issues heavy rain warning for coastal Karnataka";
    let body = "";
    expect(() => {
      ({ body } = buildDailyDigestCopy({ topStoryHeadline, sourceCount: 5, silentCount: 1 }));
    }).not.toThrow();
    expect(body).toContain(topStoryHeadline);
  });
});
