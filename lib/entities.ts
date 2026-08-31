// Numeric tokens (including one decimal point, e.g. "9.26") are checked as a
// single alternative before the general word pattern so tokenization doesn't
// split "9.26" into "9" and "26" at the dot.
const TOKEN_PATTERN = /\d+\.\d+|[\p{L}\p{N}]+/gu;
const NUMERIC_PATTERN = /^[0-9]+(\.[0-9]+)?$/;

// Sentence-initial common words that Title Case headlines capitalize anyway
// ("UP Extends ... To Women") and that would otherwise pass the capitalized-
// word check below despite carrying no entity signal.
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "of", "in", "on", "at", "to",
  "for", "and", "or", "but", "with", "as", "by", "from", "this", "that",
]);

/**
 * Pulls a small set of proper-noun/number tokens out of a headline for use
 * as a cheap corroboration signal alongside embedding cosine similarity.
 * No LLM call — deterministic and synchronous.
 *
 * Known limitation: a capitalized-word check has no signal in scripts
 * without letter case (e.g. Devanagari), so a pure-Devanagari headline only
 * contributes its numeric tokens here.
 */
export function extractEntityKeys(text: string): string[] {
  const tokens = text.match(TOKEN_PATTERN) ?? [];
  const keys: string[] = [];
  for (const token of tokens) {
    if (NUMERIC_PATTERN.test(token)) {
      keys.push(token.toLowerCase());
      continue;
    }
    const isCapitalizedWord = /^[A-Z]/.test(token) && token.length >= 2;
    if (isCapitalizedWord && !STOPWORDS.has(token.toLowerCase())) {
      keys.push(token.toLowerCase());
    }
  }
  return keys;
}
