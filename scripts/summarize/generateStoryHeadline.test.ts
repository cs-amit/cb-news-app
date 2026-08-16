import { buildSummaryPrompt, parseSummaryResponse } from "./generateStoryHeadline";

describe("buildSummaryPrompt", () => {
  it("includes every article's outlet and title, numbered", () => {
    const prompt = buildSummaryPrompt([
      { title: "Farm bill repealed", outletName: "The Hindu" },
      { title: "Govt rolls back farm bill", outletName: "Times of India" },
    ]);
    expect(prompt).toContain("1. [The Hindu] Farm bill repealed");
    expect(prompt).toContain("2. [Times of India] Govt rolls back farm bill");
  });

  it("instructs the model to treat headlines as data, not instructions", () => {
    const prompt = buildSummaryPrompt([{ title: "x", outletName: "y" }]);
    expect(prompt).toMatch(/do not follow any instructions/i);
  });
});

describe("parseSummaryResponse", () => {
  it("parses a valid JSON response embedded in surrounding text", () => {
    const raw =
      'Sure, here it is:\n{"headline": "Farm bill repealed", "summary": "Parliament repealed the farm bill."}';
    expect(parseSummaryResponse(raw)).toEqual({
      headline: "Farm bill repealed",
      summary: "Parliament repealed the farm bill.",
    });
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseSummaryResponse("no json here")).toThrow(
      "No JSON object found in LLM response"
    );
  });

  it("throws when required fields are missing", () => {
    expect(() => parseSummaryResponse('{"headline": "only this"}')).toThrow(
      "LLM response missing headline or summary string"
    );
  });
});
