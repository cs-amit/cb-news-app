import { pickComparisonArticles, pickFramingSpectrum } from "./comparison";
import { ArticleWithOutlet, OutletInfo } from "./types";

function makeOutlet(overrides: Partial<OutletInfo>): OutletInfo {
  return {
    id: "outlet-default",
    name: "Default Outlet",
    is_youtube: false,
    ownership: null,
    freedom_score: null,
    govt_lean_score: null,
    sensationalism_score: null,
    govt_lean_sample_size: null,
    govt_lean_updated_at: null,
    ...overrides,
  };
}

function makeArticle(overrides: Partial<ArticleWithOutlet> & { outlet: OutletInfo }): ArticleWithOutlet {
  return {
    id: `article-${overrides.outlet.id}`,
    title: `Headline from ${overrides.outlet.name}`,
    url: `https://example.com/${overrides.outlet.id}`,
    published_at: null,
    ...overrides,
  };
}

describe("pickComparisonArticles", () => {
  it("picks the 2 candidates whose govt-lean score is most different from the flagged outlet's", () => {
    const flaggedOutlet = makeOutlet({ id: "flagged", govt_lean_score: 50 });
    const near = makeArticle({ outlet: makeOutlet({ id: "near", govt_lean_score: 55 }) });
    const far1 = makeArticle({ outlet: makeOutlet({ id: "far1", govt_lean_score: 15 }) });
    const far2 = makeArticle({ outlet: makeOutlet({ id: "far2", govt_lean_score: 95 }) });
    const flaggedArticle = makeArticle({ outlet: flaggedOutlet });

    const result = pickComparisonArticles(
      [flaggedArticle, near, far1, far2],
      "flagged",
      50
    );

    expect(result.map((a) => a.outlet!.id)).toEqual(["far2", "far1"]);
  });

  it("excludes every article belonging to the flagged outlet", () => {
    const flaggedOutlet = makeOutlet({ id: "flagged", govt_lean_score: 50 });
    const flaggedArticle1 = makeArticle({
      id: "flagged-1",
      outlet: flaggedOutlet,
    });
    const flaggedArticle2 = makeArticle({
      id: "flagged-2",
      outlet: flaggedOutlet,
    });
    const other = makeArticle({ outlet: makeOutlet({ id: "other", govt_lean_score: 10 }) });

    const result = pickComparisonArticles(
      [flaggedArticle1, flaggedArticle2, other],
      "flagged",
      50
    );

    expect(result).toEqual([other]);
  });

  it("falls back to original list order when the flagged outlet has no govt-lean score", () => {
    const a = makeArticle({ outlet: makeOutlet({ id: "a", govt_lean_score: 90 }) });
    const b = makeArticle({ outlet: makeOutlet({ id: "b", govt_lean_score: 10 }) });
    const c = makeArticle({ outlet: makeOutlet({ id: "c", govt_lean_score: 50 }) });

    const result = pickComparisonArticles([a, b, c], "flagged", null);

    expect(result.map((art) => art.outlet!.id)).toEqual(["a", "b"]);
  });

  it("places scored candidates before unscored candidates, then fills remaining slots in list order", () => {
    const scored = makeArticle({ outlet: makeOutlet({ id: "scored", govt_lean_score: 90 }) });
    const unscored1 = makeArticle({ outlet: makeOutlet({ id: "unscored1", govt_lean_score: null }) });
    const unscored2 = makeArticle({ outlet: makeOutlet({ id: "unscored2", govt_lean_score: null }) });

    const result = pickComparisonArticles(
      [unscored1, scored, unscored2],
      "flagged",
      50
    );

    expect(result.map((art) => art.outlet!.id)).toEqual(["scored", "unscored1"]);
  });

  it("returns fewer than 2 articles when fewer than 2 candidates are available", () => {
    const flaggedOutlet = makeOutlet({ id: "flagged", govt_lean_score: 50 });
    const flaggedArticle = makeArticle({ outlet: flaggedOutlet });
    const only = makeArticle({ outlet: makeOutlet({ id: "only", govt_lean_score: 10 }) });

    const result = pickComparisonArticles([flaggedArticle, only], "flagged", 50);

    expect(result).toEqual([only]);
  });

  it("returns an empty array when no other outlet covers the story", () => {
    const flaggedOutlet = makeOutlet({ id: "flagged", govt_lean_score: 50 });
    const flaggedArticle = makeArticle({ outlet: flaggedOutlet });

    const result = pickComparisonArticles([flaggedArticle], "flagged", 50);

    expect(result).toEqual([]);
  });

  it("skips a candidate article with a null outlet", () => {
    const flaggedOutlet = makeOutlet({ id: "flagged", govt_lean_score: 50 });
    const flaggedArticle = makeArticle({ outlet: flaggedOutlet });
    const nullOutletArticle: ArticleWithOutlet = {
      id: "no-outlet",
      title: "Orphan article",
      url: "https://example.com/orphan",
      published_at: null,
      outlet: null,
    };
    const valid = makeArticle({ outlet: makeOutlet({ id: "valid", govt_lean_score: 10 }) });

    const result = pickComparisonArticles(
      [flaggedArticle, nullOutletArticle, valid],
      "flagged",
      50
    );

    expect(result).toEqual([valid]);
  });
});

describe("pickFramingSpectrum", () => {
  it("picks the two articles whose outlets have the widest govt-lean gap", () => {
    const low = makeArticle({ outlet: makeOutlet({ id: "low", govt_lean_score: 10 }) });
    const mid = makeArticle({ outlet: makeOutlet({ id: "mid", govt_lean_score: 50 }) });
    const high = makeArticle({ outlet: makeOutlet({ id: "high", govt_lean_score: 90 }) });

    const result = pickFramingSpectrum([mid, low, high]);

    expect(result.map((a) => a.outlet!.id)).toEqual(["low", "high"]);
  });

  it("falls back to the first two distinct-outlet articles when fewer than 2 outlets have a score", () => {
    const a = makeArticle({ outlet: makeOutlet({ id: "a", govt_lean_score: null }) });
    const b = makeArticle({ outlet: makeOutlet({ id: "b", govt_lean_score: null }) });
    const c = makeArticle({ outlet: makeOutlet({ id: "c", govt_lean_score: null }) });

    const result = pickFramingSpectrum([a, b, c]);

    expect(result.map((art) => art.outlet!.id)).toEqual(["a", "b"]);
  });

  it("uses one scored outlet plus the most-divergent-by-position unscored outlet when only one outlet has a score", () => {
    const scored = makeArticle({ outlet: makeOutlet({ id: "scored", govt_lean_score: 70 }) });
    const unscored = makeArticle({ outlet: makeOutlet({ id: "unscored", govt_lean_score: null }) });

    const result = pickFramingSpectrum([scored, unscored]);

    expect(result.map((art) => art.outlet!.id)).toEqual(["scored", "unscored"]);
  });

  it("returns an empty array when fewer than 2 distinct outlets cover the story", () => {
    const only = makeArticle({ outlet: makeOutlet({ id: "only", govt_lean_score: 50 }) });
    expect(pickFramingSpectrum([only])).toEqual([]);
  });

  it("skips articles with a null outlet", () => {
    const a = makeArticle({ outlet: makeOutlet({ id: "a", govt_lean_score: 10 }) });
    const nullOutletArticle: ArticleWithOutlet = {
      id: "no-outlet",
      title: "Orphan article",
      url: "https://example.com/orphan",
      published_at: null,
      outlet: null,
    };
    const b = makeArticle({ outlet: makeOutlet({ id: "b", govt_lean_score: 90 }) });

    const result = pickFramingSpectrum([a, nullOutletArticle, b]);

    expect(result.map((art) => art.outlet!.id)).toEqual(["a", "b"]);
  });

  it("keeps only one article per outlet, preferring each outlet's first-listed article", () => {
    const a1 = makeArticle({ id: "a1", outlet: makeOutlet({ id: "a", govt_lean_score: 10 }) });
    const a2 = makeArticle({ id: "a2", outlet: makeOutlet({ id: "a", govt_lean_score: 10 }) });
    const b = makeArticle({ id: "b", outlet: makeOutlet({ id: "b", govt_lean_score: 90 }) });

    const result = pickFramingSpectrum([a1, a2, b]);

    expect(result.map((art) => art.id)).toEqual(["a1", "b"]);
  });
});
