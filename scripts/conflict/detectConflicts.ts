export interface OutletOwnership {
  owner: string;
  owner_aliases?: string[];
  citation_url?: string;
  note?: string;
  note_citation_url?: string;
}

export interface ConflictFlag {
  outletId: string;
  matchedEntity: string;
  evidenceText: string;
}

const EVIDENCE_CONTEXT_CHARS = 40;

const WORD_CHAR = /\w/;

/**
 * Build a case-insensitive, word-boundary-anchored matcher for an owner alias.
 *
 * A raw substring search flags an alias that merely appears INSIDE a longer,
 * unrelated word — and the output of this function is a public accusation
 * ("owner mentioned in this story") against a named real outlet, so a false
 * positive is the most costly failure mode here. Boundaries are only applied on
 * the sides where the alias actually starts/ends with a word character, so an
 * alias with punctuation at an edge still matches.
 */
function aliasMatcher(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = WORD_CHAR.test(alias[0]) ? "\\b" : "";
  const suffix = WORD_CHAR.test(alias[alias.length - 1]) ? "\\b" : "";
  return new RegExp(`${prefix}${escaped}${suffix}`, "i");
}

export function detectConflicts(
  storyText: string,
  coveringOutlets: { outletId: string; ownership: OutletOwnership | null }[]
): ConflictFlag[] {
  const flags: ConflictFlag[] = [];

  for (const outlet of coveringOutlets) {
    if (!outlet.ownership) continue;
    const aliases = outlet.ownership.owner_aliases ?? [outlet.ownership.owner];

    for (const alias of aliases) {
      if (!alias) continue;
      const match = aliasMatcher(alias).exec(storyText);
      if (match) {
        const idx = match.index;
        flags.push({
          outletId: outlet.outletId,
          matchedEntity: alias,
          evidenceText: storyText
            .slice(
              Math.max(0, idx - EVIDENCE_CONTEXT_CHARS),
              idx + match[0].length + EVIDENCE_CONTEXT_CHARS
            )
            .trim(),
        });
        break; // one flag per outlet is enough
      }
    }
  }

  return flags;
}
