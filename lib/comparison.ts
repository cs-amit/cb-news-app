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

/**
 * One article per outlet, whole-story framing comparison — independent of
 * any conflict-of-interest flag (unlike pickComparisonArticles, which is
 * always relative to one flagged outlet). Picks the two outlets whose
 * govt-lean scores are furthest apart, so the two headlines shown are the
 * most likely to actually read differently.
 */
export function pickFramingSpectrum(articles: ArticleWithOutlet[]): ArticleWithOutlet[] {
  const seenOutlets = new Set<string>();
  const onePerOutlet: ArticleWithOutlet[] = [];
  for (const article of articles) {
    if (!article.outlet || seenOutlets.has(article.outlet.id)) continue;
    seenOutlets.add(article.outlet.id);
    onePerOutlet.push(article);
  }
  if (onePerOutlet.length < 2) return [];

  const scored = onePerOutlet.filter((a) => a.outlet!.govt_lean_score !== null);
  if (scored.length >= 2) {
    let widestPair: [ArticleWithOutlet, ArticleWithOutlet] = [scored[0], scored[1]];
    let widestGap = -1;
    for (let i = 0; i < scored.length; i++) {
      for (let j = i + 1; j < scored.length; j++) {
        const gap = Math.abs(scored[i].outlet!.govt_lean_score! - scored[j].outlet!.govt_lean_score!);
        if (gap > widestGap) {
          widestGap = gap;
          widestPair = [scored[i], scored[j]];
        }
      }
    }
    widestPair.sort((a, b) => a.outlet!.govt_lean_score! - b.outlet!.govt_lean_score!);
    return widestPair;
  }

  return onePerOutlet.slice(0, 2);
}
