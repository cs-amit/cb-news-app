import { pickComparisonArticles } from "./comparison";
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
