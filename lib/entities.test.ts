import { extractEntityKeys } from "./entities";

describe("extractEntityKeys", () => {
  it("extracts numeric tokens, including decimals", () => {
    expect(extractEntityKeys("9.26 lakh passengers")).toEqual(
      expect.arrayContaining(["9.26"])
    );
  });

  it("extracts short ALL-CAPS tokens like state abbreviations", () => {
    expect(extractEntityKeys("UP Govt Big Gift For Women")).toEqual(
      expect.arrayContaining(["up"])
    );
  });

  it("filters out common stopwords even when capitalized by title case", () => {
    const keys = extractEntityKeys("UP Extends Free Bus Travel To Women Above 60");
    expect(keys).not.toContain("to");
  });

  it("strips trailing punctuation and still keeps the numeric token", () => {
    expect(extractEntityKeys("60+ महिलाओं")).toEqual(["60"]);
  });

  it("finds real overlap between the diagnosed cross-lingual headline pair", () => {
    const a = extractEntityKeys("UP Extends Free Bus Travel To Women Above 60");
    const b = extractEntityKeys("UP Govt Big Gift For Women: 60+ महिलाओं");
    const overlap = a.filter((k) => b.includes(k));
    expect(overlap).toEqual(expect.arrayContaining(["up", "60", "women"]));
  });

  it("lowercases tokens so comparisons are case-insensitive", () => {
    expect(extractEntityKeys("Delhi")).toEqual(["delhi"]);
  });

  it("returns an empty array for text with no significant tokens", () => {
    expect(extractEntityKeys("the a an is are")).toEqual([]);
  });
});
