export interface DemoPersona {
  handle: string;
  listName: string;
  compassPosition: number;
}

// Compass zones are equal thirds of [-100, 100] (see CompassGauge.tsx):
// critical <= -33.3, balanced in between, friendly >= 33.3. Spread across
// all three plus a near-center point so the Discover tab shows real
// variety, not six similar profiles.
export const DEMO_PERSONAS: DemoPersona[] = [
  { handle: "demo_arjun", listName: "Arjun's picks", compassPosition: -75 },
  { handle: "demo_meera", listName: "Meera is watching", compassPosition: -20 },
  { handle: "demo_priya", listName: "Priya's reads", compassPosition: 5 },
  { handle: "demo_kabir", listName: "Kabir's saved stories", compassPosition: 20 },
  { handle: "demo_zoya", listName: "Zoya's list", compassPosition: 55 },
  { handle: "demo_rohan", listName: "Rohan's picks", compassPosition: 85 },
];

export interface PersonaListPlan {
  persona: DemoPersona;
  storyIds: string[];
}

/**
 * Splits a shared pool of real story ids into non-overlapping slices, one
 * per persona, up to `perPersona` each. Runs short gracefully (a persona
 * just gets fewer stories) instead of failing -- the seed script deals with
 * whatever the live corpus actually has available.
 */
export function buildPersonaListPlan(
  storyIds: string[],
  personas: DemoPersona[],
  perPersona: number
): PersonaListPlan[] {
  let cursor = 0;
  return personas.map((persona) => {
    const slice = storyIds.slice(cursor, cursor + perPersona);
    cursor += slice.length;
    return { persona, storyIds: slice };
  });
}
