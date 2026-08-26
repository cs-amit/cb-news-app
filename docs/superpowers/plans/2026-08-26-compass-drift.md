# Compass Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the compass badge a living signal — every outlet-poll answer nudges the user's own compass position slightly, without ever moving fast or requiring passive-reading inference.

**Architecture:** A pure exponential-moving-average function with a hard weekly cap (`lib/compassDrift.ts`), wired into the existing `handlePollResponse` flow in `app/story/[id].tsx` alongside the poll submission that already updates the public crowdsourced tally. One poll tap now does both — no UI change needed beyond that wiring.

**Tech Stack:** Same as the rest of the codebase — Jest + ts-jest for the pure drift function, Supabase for persistence.

**Spec:** `docs/superpowers/specs/2026-08-26-social-layer-design.md` §5 (Political Compass: Drift Mechanism).

**Execution order:** Priority 2 of 4 in the spec's §8 cut order. **Depends on `2026-08-26-social-layer-foundation.md`** (needs `profiles.compass_position` to exist, and reads/writes it) — execute that plan first.

## Global Constraints

- `WEIGHT = 0.02` and `WEEKLY_CAP = 3` are the exact values from spec §5 — do not change without updating the spec.
- Drift is driven only by explicit outlet-poll answers, never by passive article reads — no task in this plan may read `user_story_views` to compute drift.
- The existing public crowdsourced tally (`outlet_poll_tallies`, `submitPollResponse`) is unchanged — drift is purely additive.

---

## File Structure

- `supabase/migrations/0007_compass_drift.sql` — new columns on `profiles` for weekly-cap bookkeeping.
- `lib/compassDrift.ts` — pure drift computation.
- `lib/compassDrift.test.ts`
- `lib/queries.ts` — modify: add `applyPollDrift`.
- `lib/queries.test.ts` — modify: tests for `applyPollDrift`.
- `app/story/[id].tsx` — modify: call `applyPollDrift` alongside the existing poll submission.

---

### Task 1: Migration — weekly drift bookkeeping columns

**Files:**
- Create: `supabase/migrations/0007_compass_drift.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table profiles
  add column compass_week_started_at timestamptz,
  add column compass_week_delta numeric not null default 0;
```

- [ ] **Step 2: Apply the migration in the Supabase SQL Editor against the production project**

- [ ] **Step 3: Verify the columns exist**

```bash
curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/profiles?select=compass_week_started_at,compass_week_delta&limit=1" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY"
```
Expected: `200` with a JSON array (possibly empty), not a column-not-found error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_compass_drift.sql
git commit -m "feat: add compass weekly-drift bookkeeping columns"
```

---

### Task 2: Pure drift computation

**Files:**
- Create: `lib/compassDrift.ts`
- Test: `lib/compassDrift.test.ts`

**Interfaces:**
- Produces: `DriftState { position: number; weekStartedAt: string; weekDelta: number }`, `PollResponseForDrift = "critical" | "balanced" | "friendly"`, `computeDrift(state: DriftState, response: PollResponseForDrift, now: Date): DriftState`

- [ ] **Step 1: Write the failing tests**

```ts
import { computeDrift, DriftState } from "./compassDrift";

const START_OF_WEEK = new Date("2026-08-26T00:00:00Z");

function stateAt(position: number, weekStartedAt: Date, weekDelta = 0): DriftState {
  return { position, weekStartedAt: weekStartedAt.toISOString(), weekDelta };
}

describe("computeDrift", () => {
  it("nudges toward the friendly target by a small step from a fresh week", () => {
    const result = computeDrift(stateAt(0, START_OF_WEEK), "friendly", START_OF_WEEK);
    expect(result.position).toBeCloseTo(2, 5); // 0.02 * (100 - 0) = 2
    expect(result.weekDelta).toBeCloseTo(2, 5);
  });

  it("nudges toward the critical target", () => {
    const result = computeDrift(stateAt(0, START_OF_WEEK), "critical", START_OF_WEEK);
    expect(result.position).toBeCloseTo(-2, 5);
  });

  it("nudges toward 0 for a balanced answer, pulling an extreme position back toward center", () => {
    const result = computeDrift(stateAt(80, START_OF_WEEK), "balanced", START_OF_WEEK);
    expect(result.position).toBeLessThan(80);
    expect(result.position).toBeCloseTo(78.4, 5); // 80 + 0.02 * (0 - 80) = 78.4
  });

  it("caps cumulative movement at the weekly cap even across multiple answers", () => {
    let state = stateAt(0, START_OF_WEEK);
    for (let i = 0; i < 10; i++) {
      state = computeDrift(state, "friendly", START_OF_WEEK);
    }
    expect(state.weekDelta).toBeCloseTo(3, 5); // WEEKLY_CAP
    expect(state.position).toBeCloseTo(3, 5);
  });

  it("applies zero further movement once the weekly cap is fully used", () => {
    const atCap = stateAt(3, START_OF_WEEK, 3);
    const result = computeDrift(atCap, "friendly", START_OF_WEEK);
    expect(result.position).toBe(3);
    expect(result.weekDelta).toBe(3);
  });

  it("resets the weekly cap once a new week has started", () => {
    const staleWeek = new Date(START_OF_WEEK.getTime() - 8 * 24 * 60 * 60 * 1000);
    const atCap = stateAt(3, staleWeek, 3);
    const result = computeDrift(atCap, "friendly", START_OF_WEEK);
    expect(result.weekStartedAt).toBe(START_OF_WEEK.toISOString());
    expect(result.weekDelta).toBeCloseTo(1.94, 2); // 0.02 * (100 - 3) = 1.94, fresh cap
    expect(result.position).toBeGreaterThan(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/compassDrift.test.ts`
Expected: FAIL — `Cannot find module './compassDrift'`

- [ ] **Step 3: Write minimal implementation**

```ts
export interface DriftState {
  position: number;
  weekStartedAt: string;
  weekDelta: number;
}

export type PollResponseForDrift = "critical" | "balanced" | "friendly";

// Small enough that a single answer never meaningfully moves the badge;
// the weekly cap below is the actual "moves slowly" guarantee.
const DRIFT_WEIGHT = 0.02;

// Total absolute movement allowed per rolling week, regardless of how many
// poll answers land in that week.
const WEEKLY_CAP = 3;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const TARGETS: Record<PollResponseForDrift, number> = {
  critical: -100,
  balanced: 0,
  friendly: 100,
};

export function computeDrift(state: DriftState, response: PollResponseForDrift, now: Date): DriftState {
  const nowMs = now.getTime();
  const weekStartMs = new Date(state.weekStartedAt).getTime();
  const weekExpired = !state.weekStartedAt || nowMs - weekStartMs >= WEEK_MS;

  const weekStartedAt = weekExpired ? now.toISOString() : state.weekStartedAt;
  const weekDeltaSoFar = weekExpired ? 0 : state.weekDelta;

  const remainingCap = WEEKLY_CAP - weekDeltaSoFar;
  if (remainingCap <= 0) {
    return { position: state.position, weekStartedAt, weekDelta: weekDeltaSoFar };
  }

  const target = TARGETS[response];
  const proposedDelta = DRIFT_WEIGHT * (target - state.position);
  const cappedMagnitude = Math.min(Math.abs(proposedDelta), remainingCap);
  const cappedDelta = Math.sign(proposedDelta) * cappedMagnitude;

  return {
    position: state.position + cappedDelta,
    weekStartedAt,
    weekDelta: weekDeltaSoFar + Math.abs(cappedDelta),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/compassDrift.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/compassDrift.ts lib/compassDrift.test.ts
git commit -m "feat: add pure compass drift computation"
```

---

### Task 3: Wire drift into poll responses

**Files:**
- Modify: `lib/queries.ts`
- Modify: `lib/queries.test.ts`
- Modify: `app/story/[id].tsx`

**Interfaces:**
- Consumes: `computeDrift`, `DriftState`, `PollResponseForDrift` from `lib/compassDrift.ts`
- Produces: `applyPollDrift(supabase, userId: string, response: PollResponseForDrift): Promise<void>`

- [ ] **Step 1: Write the failing test**

Add to `lib/queries.test.ts`:

```ts
import { applyPollDrift } from "./queries";

describe("applyPollDrift", () => {
  function makeMock(profileRow: any) {
    const maybeSingle = jest.fn().mockResolvedValue({ data: profileRow, error: null });
    const eqSelect = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq: eqSelect });
    const eqUpdate = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn().mockReturnValue({ eq: eqUpdate });
    const from = jest.fn().mockReturnValue({ select, update });
    return { client: { from } as any, select, update, eqUpdate };
  }

  it("reads the current drift state, computes the new one, and writes it back", async () => {
    const { client, update, eqUpdate } = makeMock({
      compass_position: 0,
      compass_week_started_at: null,
      compass_week_delta: 0,
    });

    await applyPollDrift(client, "user-1", "friendly");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        compass_position: expect.any(Number),
        compass_week_delta: expect.any(Number),
      })
    );
    expect(eqUpdate).toHaveBeenCalledWith("id", "user-1");
  });

  it("does nothing if the profile has never taken the quiz (position is null)", async () => {
    const { client, update } = makeMock({
      compass_position: null,
      compass_week_started_at: null,
      compass_week_delta: 0,
    });

    await applyPollDrift(client, "user-1", "friendly");

    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/queries.test.ts`
Expected: FAIL — `applyPollDrift` is not exported

- [ ] **Step 3: Add the implementation to `lib/queries.ts`**

Add the import at the top of the file:
```ts
import { computeDrift, PollResponseForDrift } from "./compassDrift";
```

Append the function:
```ts
// No-ops for a user who hasn't taken the quiz yet (compass_position is
// null) — there is nothing to drift, and writing a synthetic starting
// position here would silently bypass the quiz.
export async function applyPollDrift(
  supabase: SupabaseClient,
  userId: string,
  response: PollResponseForDrift
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("compass_position, compass_week_started_at, compass_week_delta")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch compass state: ${error.message}`);
  if (!data || data.compass_position === null) return;

  const next = computeDrift(
    {
      position: data.compass_position,
      weekStartedAt: data.compass_week_started_at ?? new Date(0).toISOString(),
      weekDelta: data.compass_week_delta,
    },
    response,
    new Date()
  );

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      compass_position: next.position,
      compass_week_started_at: next.weekStartedAt,
      compass_week_delta: next.weekDelta,
    })
    .eq("id", userId);
  if (updateError) throw new Error(`Failed to save compass drift: ${updateError.message}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/queries.test.ts`
Expected: PASS (all tests, including the new ones)

- [ ] **Step 5: Wire it into the story screen's poll handler**

In `app/story/[id].tsx`, modify `handlePollResponse` (add the import `applyPollDrift` to the existing `lib/queries` import, and call it fire-and-forget alongside the existing tally refresh, matching the codebase's existing fire-and-forget pattern for streak recomputation):

```tsx
async function handlePollResponse(outletId: string, response: "critical" | "balanced" | "friendly") {
  if (!userId) return;
  try {
    await submitPollResponse(supabase, userId, story!.id, outletId, response);
    const tally = await fetchPollTally(supabase, story!.id, outletId);
    setPollTallies((prev) => ({ ...prev, [outletId]: tally }));
    // Fire-and-forget: a drift-save hiccup must never block the tally the
    // user is watching update in front of them.
    applyPollDrift(supabase, userId, response).catch((err) =>
      console.error("Failed to apply compass drift:", err)
    );
  } catch (err) {
    console.error("Failed to submit poll response:", err);
  }
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Manually verify via the dev-client build**

As a user who has taken the quiz, answer an outlet poll on a story screen. Confirm `profiles.compass_position` in the Supabase Table Editor moves by a small amount (a couple points, not a large jump).

- [ ] **Step 8: Commit**

```bash
git add lib/queries.ts lib/queries.test.ts app/story/[id].tsx
git commit -m "feat: drive compass drift from outlet poll answers"
```

---

## Self-Review Notes

- **Spec coverage:** §5 (Drift Mechanism) fully covered: EMA weight, weekly cap, week-rollover reset, poll-answer-only trigger, tally left unchanged — all in Task 2/3.
- **Type consistency check:** `PollResponseForDrift` in `lib/compassDrift.ts` and the existing `PollResponseValue` in `lib/polls.ts` are structurally identical (`"critical" | "balanced" | "friendly"`) but intentionally kept as separate named types — `lib/compassDrift.ts` has no dependency on `lib/polls.ts`, keeping the pure drift module fully standalone and easy to test in isolation. `app/story/[id].tsx`'s `handlePollResponse` parameter type already matches both structurally, so no cast is needed at the call site.
- **Hard constraint reminder:** `applyPollDrift` only ever *writes* `compass_position` — nothing in this plan reads it to affect what content is fetched or shown.
