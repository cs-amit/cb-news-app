export interface ViewRow {
  story_id: string;
  outlet_id: string;
  viewed_at: string;
}

function dateKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD, UTC — deterministic regardless of device timezone.
}

function computeComparisonDays(rows: ViewRow[]): Set<string> {
  const byDateStory = new Map<string, Map<string, Set<string>>>();
  for (const row of rows) {
    const date = dateKey(row.viewed_at);
    if (!byDateStory.has(date)) byDateStory.set(date, new Map());
    const byStory = byDateStory.get(date)!;
    if (!byStory.has(row.story_id)) byStory.set(row.story_id, new Set());
    byStory.get(row.story_id)!.add(row.outlet_id);
  }

  const comparisonDays = new Set<string>();
  for (const [date, byStory] of byDateStory) {
    for (const outlets of byStory.values()) {
      if (outlets.size >= 2) {
        comparisonDays.add(date);
        break;
      }
    }
  }
  return comparisonDays;
}

export function computeStreak(rows: ViewRow[], now: Date = new Date()): number {
  const comparisonDays = computeComparisonDays(rows);
  const cursor = new Date(now.getTime());

  // Grace day: if today hasn't produced a comparison yet, that doesn't mean
  // the streak is already broken — start counting from yesterday so opening
  // the app mid-day doesn't show a streak drop before the day is even over.
  if (!comparisonDays.has(dateKey(cursor.toISOString()))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while (comparisonDays.has(dateKey(cursor.toISOString()))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function computeSidesSeenTotal(rows: ViewRow[]): number {
  const unique = new Set(rows.map((r) => `${r.story_id}:${r.outlet_id}`));
  return unique.size;
}
