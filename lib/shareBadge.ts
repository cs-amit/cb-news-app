/**
 * Share-sheet dialog title for a shared compass badge. Strips the `demo_`
 * prefix seeded demo handles carry internally (see scripts/seed/demoPersonas.ts)
 * so a shared demo badge doesn't leak that naming to whoever receives it.
 */
export function buildShareDialogTitle(handle: string): string {
  return `@${handle.replace(/^demo_/, "")}'s Sourced compass`;
}
