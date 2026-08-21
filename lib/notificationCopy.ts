// Spec §7.3 Ethical Nudge Charter, enforced in code rather than left as a
// style guideline: no loss-framed streak-guilt copy (Kahneman & Tversky
// prospect theory — the exact pattern this project deliberately avoids),
// no fear/urgency framing. Runs on every string this module produces, and
// is unit-tested against real bad examples to prove it actually catches them.
const BANNED_PATTERNS: RegExp[] = [
  /don'?t lose/i,
  /you'?ll lose/i,
  /before it'?s too late/i,
  /hid(e|ing)/i,
  /last chance/i,
  /miss(ing)? out/i,
  /\bwarning\b/i,
  /\burgent\b/i,
  /streak (is )?(at risk|broken|ending)/i,
];

export function assertEthicalCopy(text: string): void {
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(
        `Copy violates the ethical nudge charter (matched ${pattern}): "${text}"`
      );
    }
  }
}

export interface DailyDigestStats {
  topStoryHeadline: string;
  sourceCount: number;
  silentCount: number;
}

// Same defect class as lib/shareCopy.ts's buildShareText: assertEthicalCopy
// must run on the AUTHORED template, not on a string with a journalist's
// headline already interpolated into it — an ordinary headline (e.g. "IMD
// issues heavy rain warning...") would otherwise trip the banned-pattern
// guard and throw. Build with a placeholder, assert that, substitute after
// via a function replacer (avoids "$"-in-headline replacement-pattern bugs).
const HEADLINE_PLACEHOLDER = " HEADLINE ";

export function buildDailyDigestCopy(stats: DailyDigestStats): { title: string; body: string } {
  const title = "Today's story, from every side";
  const template =
    stats.silentCount > 0
      ? `"${HEADLINE_PLACEHOLDER}" has ${stats.sourceCount} sources covering it, and ${stats.silentCount} outlets haven't weighed in yet.`
      : `"${HEADLINE_PLACEHOLDER}" has ${stats.sourceCount} sources covering it. See how they compare.`;

  assertEthicalCopy(title);
  assertEthicalCopy(template);
  const body = template.replace(HEADLINE_PLACEHOLDER, () => stats.topStoryHeadline);
  return { title, body };
}
