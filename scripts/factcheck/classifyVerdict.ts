// A cheap keyword heuristic, deliberately not an LLM call — this project's
// Gemini generateContent quota (~20/day) is already fully committed to
// headline batching (Task 2, Week 2), and fact-check RSS titles reliably
// state their own verdict in plain language ("FALSE", "misleading", etc.).
// A negation immediately before a positive-verdict word ("not true",
// "isn't confirmed", "far from verified") is real fact-check headline
// phrasing that the plain positive-verdict regex below would otherwise
// misread as a confirming verdict — attributing an inverted "True" to a
// named fact-checking organization on-screen, a real reputational risk for
// a source-credibility product. Deliberately classifies as "Unverified"
// rather than "False": a negated "true" claim usually IS false, but "not
// yet confirmed" specifically means not-yet-verified, not proven false —
// and this heuristic can't tell those two apart from the headline alone.
// Prefer under-classifying (Unverified) to a wrong confident verdict
// either way (spec's own fact-checking framing, matching this file's
// existing fallback for ambiguous titles).
const NEGATED_POSITIVE_VERDICT = /\b(not|isn'?t|never|no,?)\s+(\w+\s+){0,2}(true|confirmed|correct|verified)\b/;

export function classifyVerdict(title: string): "False" | "Misleading" | "True" | "Unverified" {
  const lower = title.toLowerCase();
  if (/\b(false|fake|debunk|hoax|morphed|doctored)\b/.test(lower)) return "False";
  if (/\bmisleading\b/.test(lower)) return "Misleading";
  if (NEGATED_POSITIVE_VERDICT.test(lower)) return "Unverified";
  if (/\b(true|confirmed|correct|verified)\b/.test(lower)) return "True";
  return "Unverified";
}
