// A cheap keyword heuristic, deliberately not an LLM call — this project's
// Gemini generateContent quota (~20/day) is already fully committed to
// headline batching (Task 2, Week 2), and fact-check RSS titles reliably
// state their own verdict in plain language ("FALSE", "misleading", etc.).
export function classifyVerdict(title: string): "False" | "Misleading" | "True" | "Unverified" {
  const lower = title.toLowerCase();
  if (/\b(false|fake|debunk|hoax|morphed|doctored)\b/.test(lower)) return "False";
  if (/\bmisleading\b/.test(lower)) return "Misleading";
  if (/\b(true|confirmed|correct|verified)\b/.test(lower)) return "True";
  return "Unverified";
}
