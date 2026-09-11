import { assertEthicalCopy } from "./notificationCopy";

// assertEthicalCopy must only ever see copy this app authored, not a
// journalist's headline substituted into it - an ordinary headline
// containing a word like "warning" or "hiding" (both common in real Indian
// news headlines) would otherwise trip the banned-pattern guard and throw
// on a perfectly innocuous story. Build the template with a placeholder,
// assert THAT, then substitute the real headline in afterward. A function
// replacer (not a plain string) is used so a "$" in the headline (e.g. "$10
// million") isn't misinterpreted as a replacement pattern.
const HEADLINE_PLACEHOLDER = "___HEADLINE___";

export function buildShareText(
  story: { headline: string; id: string },
  sourceCount: number,
  silentCount: number
): string {
  const silenceLine = silentCount > 0 ? `\n${silentCount} outlets haven't covered it yet.` : "";
  // A raw custom-scheme link (no hosted website to fall back to) won't
  // reliably render as tappable in every share target -- WhatsApp/SMS
  // mostly only auto-link https:// URLs -- but it's real and followable for
  // anyone who already has the app installed, which is strictly better than
  // the previous text-only share having no link at all.
  const template = `"${HEADLINE_PLACEHOLDER}"\n\n${sourceCount} outlets are covering this story.${silenceLine}\n\nSee who's telling you the story - via Sourced.\nsourced://story/${story.id}`;
  assertEthicalCopy(template);
  return template.replace(HEADLINE_PLACEHOLDER, () => story.headline);
}
