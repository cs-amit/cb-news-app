import { ArticleWithOutlet } from "./types";

const COMPARISON_COUNT = 2;

/**
 * Picks up to COMPARISON_COUNT articles from OTHER outlets to show alongside
 * a flagged outlet's coverage of the same story. Prefers outlets whose
 * govt-lean score is most different from the flagged outlet's — surfacing
 * the most contrasting framing using data already computed, no new fetch.
 */
export function pickComparisonArticles(
  articles: ArticleWithOutlet[],
  flaggedOutletId: string,
  flaggedGovtLeanScore: number | null
): ArticleWithOutlet[] {
  const candidates = articles.filter(
    (article) => article.outlet !== null && article.outlet.id !== flaggedOutletId
  );

  if (flaggedGovtLeanScore === null) {
    return candidates.slice(0, COMPARISON_COUNT);
  }

  const scored = candidates.filter((article) => article.outlet!.govt_lean_score !== null);
  const unscored = candidates.filter((article) => article.outlet!.govt_lean_score === null);

  scored.sort((a, b) => {
    const diffA = Math.abs(a.outlet!.govt_lean_score! - flaggedGovtLeanScore);
    const diffB = Math.abs(b.outlet!.govt_lean_score! - flaggedGovtLeanScore);
    return diffB - diffA;
  });

  return [...scored, ...unscored].slice(0, COMPARISON_COUNT);
}
