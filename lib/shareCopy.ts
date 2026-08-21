import { assertEthicalCopy } from "./notificationCopy";

export function buildShareText(
  story: { headline: string },
  sourceCount: number,
  silentCount: number
): string {
  const silenceLine = silentCount > 0 ? `\n${silentCount} outlets haven't covered it yet.` : "";
  const text = `"${story.headline}"\n\n${sourceCount} outlets are covering this story.${silenceLine}\n\nSee who's telling you the story — via Sourced.`;
  assertEthicalCopy(text);
  return text;
}
