import { buildShareDialogTitle } from "./shareBadge";

describe("buildShareDialogTitle", () => {
  it("names the handle in the share dialog title", () => {
    expect(buildShareDialogTitle("arjun")).toBe("@arjun's Sourced compass");
  });

  it("strips a demo_ prefix so seeded demo handles don't leak internal naming", () => {
    expect(buildShareDialogTitle("demo_arjun")).toBe("@arjun's Sourced compass");
  });
});
