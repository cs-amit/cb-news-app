export interface OutletSummary {
  id: string;
  name: string;
  is_youtube: boolean;
}

// Spec requirement: guard against false positives from feed delay — a story
// only an hour old shouldn't show every non-covering outlet as "silent"
// before normal RSS polling has had a chance to catch up.
const SILENCE_LAG_GUARD_HOURS = 18;

export function computeSilentOutlets(
  activeOutlets: OutletSummary[],
  coveringOutletIds: Set<string>,
  storyFirstSeenAt: string,
  now: Date = new Date()
): OutletSummary[] {
  const ageHours = (now.getTime() - new Date(storyFirstSeenAt).getTime()) / (1000 * 60 * 60);
  if (ageHours < SILENCE_LAG_GUARD_HOURS) return [];
  return activeOutlets.filter((o) => !coveringOutletIds.has(o.id));
}
