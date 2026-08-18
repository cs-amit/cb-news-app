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

export function detectConflicts(
  storyText: string,
  coveringOutlets: { outletId: string; ownership: OutletOwnership | null }[]
): ConflictFlag[] {
  const flags: ConflictFlag[] = [];
  const lowerStoryText = storyText.toLowerCase();

  for (const outlet of coveringOutlets) {
    if (!outlet.ownership) continue;
    const aliases = outlet.ownership.owner_aliases ?? [outlet.ownership.owner];

    for (const alias of aliases) {
      const idx = lowerStoryText.indexOf(alias.toLowerCase());
      if (idx !== -1) {
        flags.push({
          outletId: outlet.outletId,
          matchedEntity: alias,
          evidenceText: storyText
            .slice(Math.max(0, idx - EVIDENCE_CONTEXT_CHARS), idx + alias.length + EVIDENCE_CONTEXT_CHARS)
            .trim(),
        });
        break; // one flag per outlet is enough
      }
    }
  }

  return flags;
}
