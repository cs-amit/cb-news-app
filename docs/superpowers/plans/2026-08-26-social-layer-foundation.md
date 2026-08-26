# Social Layer Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational social layer — mandatory public handle, public profile pages, curated lists/reposts, and the single-axis political compass quiz with a static (non-drifting) badge.

**Architecture:** Reuses the existing Supabase anonymous→linked-account upgrade flow (no new auth system). Adds `handle`/`compass_position`/`compass_public` columns to `profiles`, two new tables (`lists`, `list_items`), and a `public_profiles` view that exposes only public fields — mirroring the existing `outlet_poll_tallies` view pattern (0005_polls.sql) for bypassing RLS on an otherwise-private table. Pure logic (handle validation, quiz scoring, reorder math) lives in new `lib/*.ts` files with full Jest coverage, matching the codebase's existing split between pure `lib/streak.ts`/`lib/polls.ts` and the async Supabase calls in `lib/queries.ts`. Screens are plain React Native `StyleSheet` (no design tokens yet — that's Plan 3), consistent with every existing screen.

**Tech Stack:** Expo Router, Supabase (Postgres + Auth + RLS), Jest + ts-jest for pure-function tests (no React Native Testing Library is installed — screens are verified by `tsc --noEmit` plus manual verification via the dev-client build, matching how every existing screen in this codebase is verified).

**Spec:** `docs/superpowers/specs/2026-08-26-social-layer-design.md` — this plan implements §1 (Identity & Auth), §2 (Profile Pages), §3 (Curated Lists & Reposts), and §4 (Quiz, static position only — drift is Plan `2026-08-26-compass-drift.md`).

**Execution order:** This is priority 1 of 4 in the spec's §8 cut order — execute this plan **first**. `2026-08-26-compass-drift.md` depends on the `compass_position`/`compass_public` columns and `lib/compass.ts` this plan creates.

## Global Constraints

- Handle format: lowercase letters, digits, underscore, 3-20 characters — enforced both client-side (`lib/handle.ts`) and as a DB check constraint, values must match exactly: `^[a-z0-9_]{3,20}$`.
- Compass position is a number in `[-100, 100]`; `-100` = fully government-critical, `+100` = fully government-friendly, per spec §4.
- Hard constraint from spec §4: no code path may read `compass_position` to filter, rank, or select content shown to a user. This plan does not add any such code path — flagged here so later plans/reviewers check it stays that way.
- All new tables use Row-Level Security; no table is ever readable/writable without an explicit policy (matches every existing migration in `supabase/migrations/`).
- Anonymous users can do everything in this plan privately (take the quiz, build private lists); going public (making a list public, or making the compass badge visible) requires the account upgrade to have completed first.

---

## File Structure

- `supabase/migrations/0006_social_layer.sql` — new columns on `profiles`, new `lists`/`list_items` tables + RLS, `public_profiles` view.
- `lib/handle.ts` — pure handle-format validation.
- `lib/handle.test.ts`
- `lib/compass.ts` — quiz question data + pure scoring function.
- `lib/compass.test.ts`
- `lib/lists.ts` — pure reorder-position math.
- `lib/lists.test.ts`
- `lib/queries.ts` — modify: add `claimHandle`, `createDefaultRepostsList`, `createList`, `fetchUserLists`, `fetchPublicProfile`, `fetchPublicLists`, `fetchListItems`, `addStoryToList`, `removeStoryFromList`, `reorderListItems`, `toggleListPublic`, `setCompassPosition`.
- `lib/queries.test.ts` — modify: tests for all of the above.
- `app/upgrade.tsx` — modify: add mandatory handle selection to the existing email-upgrade flow.
- `app/quiz.tsx` — new: the compass quiz screen.
- `app/profile/[handle].tsx` — new: public/own profile screen.
- `app/_layout.tsx` — modify: register the two new routes.
- `app/index.tsx` — modify: add a "My profile" entry point and a "Repost" action per story.
- `app/methodology.tsx` — modify: add the explicit "this never changes your feed" promise from spec §4.

---

### Task 1: Migration — social layer schema

**Files:**
- Create: `supabase/migrations/0006_social_layer.sql`

**Interfaces:**
- Produces: `profiles.handle` (text, unique, nullable), `profiles.compass_position` (numeric, nullable), `profiles.compass_public` (boolean, default true), `profiles.compass_quiz_taken_at` (timestamptz, nullable); tables `lists`, `list_items`; view `public_profiles(id, handle, compass_position)`.

- [ ] **Step 1: Write the migration**

```sql
alter table profiles
  add column handle text unique,
  add column compass_position numeric,
  add column compass_public boolean not null default true,
  add column compass_quiz_taken_at timestamptz;

alter table profiles
  add constraint handle_format check (handle is null or handle ~ '^[a-z0-9_]{3,20}$');

alter table profiles
  add constraint compass_position_range
    check (compass_position is null or (compass_position >= -100 and compass_position <= 100));

create table lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  is_public boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  story_id uuid not null references stories(id) on delete cascade,
  position int not null,
  added_at timestamptz not null default now(),
  unique (list_id, story_id)
);

alter table lists enable row level security;
alter table list_items enable row level security;

create policy "owners manage own lists" on lists
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "public read public lists" on lists
  for select using (is_public = true);

create policy "owners manage own list items" on list_items
  for all using (
    exists (select 1 from lists where lists.id = list_items.list_id and lists.owner_id = auth.uid())
  ) with check (
    exists (select 1 from lists where lists.id = list_items.list_id and lists.owner_id = auth.uid())
  );

create policy "public read items of public lists" on list_items
  for select using (
    exists (select 1 from lists where lists.id = list_items.list_id and lists.is_public = true)
  );

-- Same pattern as outlet_poll_tallies (0005_polls.sql): a view exposing only
-- the fields meant to be public, bypassing RLS on the underlying (otherwise
-- fully private) profiles table. compass_position resolves to null here
-- whenever the owner has toggled compass_public off, even though the
-- underlying row still has a real value — the badge stays hidden without
-- deleting the user's own data.
create view public_profiles as
  select
    id,
    handle,
    case when compass_public then compass_position else null end as compass_position
  from profiles
  where handle is not null;

grant select on public_profiles to anon, authenticated;
```

- [ ] **Step 2: Apply the migration in the Supabase SQL Editor against the production project**

Open the Supabase dashboard SQL Editor for the linked project, paste the migration contents, run it. Confirm no errors.

- [ ] **Step 3: Verify the new tables/columns exist**

Run (adjust host/key from `.env`):
```bash
curl -s -o /dev/null -w "%{http_code}\n" "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/lists?select=*&limit=1" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY"
curl -s -o /dev/null -w "%{http_code}\n" "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/public_profiles?select=*&limit=1" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY"
```
Expected: both return `200`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_social_layer.sql
git commit -m "feat: add social layer schema (handle, compass, lists)"
```

---

### Task 2: Handle validation

**Files:**
- Create: `lib/handle.ts`
- Test: `lib/handle.test.ts`

**Interfaces:**
- Produces: `isValidHandle(handle: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { isValidHandle } from "./handle";

describe("isValidHandle", () => {
  it("accepts lowercase letters, digits, and underscore within length bounds", () => {
    expect(isValidHandle("amit_57")).toBe(true);
    expect(isValidHandle("abc")).toBe(true);
    expect(isValidHandle("a".repeat(20))).toBe(true);
  });

  it("rejects too short or too long handles", () => {
    expect(isValidHandle("ab")).toBe(false);
    expect(isValidHandle("a".repeat(21))).toBe(false);
  });

  it("rejects uppercase, spaces, and symbols other than underscore", () => {
    expect(isValidHandle("Amit57")).toBe(false);
    expect(isValidHandle("amit 57")).toBe(false);
    expect(isValidHandle("amit-57")).toBe(false);
    expect(isValidHandle("amit@57")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/handle.test.ts`
Expected: FAIL — `Cannot find module './handle'`

- [ ] **Step 3: Write minimal implementation**

```ts
const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/handle.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/handle.ts lib/handle.test.ts
git commit -m "feat: add handle format validation"
```

---

### Task 3: Quiz question data and scoring

**Files:**
- Create: `lib/compass.ts`
- Test: `lib/compass.test.ts`

**Interfaces:**
- Produces: `QuizQuestion { id: string; statement: string; direction: 1 | -1 }`, `QUIZ_QUESTIONS: QuizQuestion[]` (6 entries), `scoreQuizAnswers(answers: Record<string, number>): number`

- [ ] **Step 1: Write the failing test**

```ts
import { QUIZ_QUESTIONS, scoreQuizAnswers } from "./compass";

describe("QUIZ_QUESTIONS", () => {
  it("has 6 questions with unique ids", () => {
    expect(QUIZ_QUESTIONS).toHaveLength(6);
    const ids = new Set(QUIZ_QUESTIONS.map((q) => q.id));
    expect(ids.size).toBe(6);
  });
});

describe("scoreQuizAnswers", () => {
  function answersOf(value: number): Record<string, number> {
    const answers: Record<string, number> = {};
    for (const q of QUIZ_QUESTIONS) answers[q.id] = value;
    return answers;
  }

  it("scores all-neutral answers as 0", () => {
    expect(scoreQuizAnswers(answersOf(0))).toBe(0);
  });

  it("scores maximum agreement, direction-adjusted, as +100", () => {
    const answers: Record<string, number> = {};
    for (const q of QUIZ_QUESTIONS) answers[q.id] = 2 * q.direction;
    expect(scoreQuizAnswers(answers)).toBe(100);
  });

  it("scores maximum disagreement, direction-adjusted, as -100", () => {
    const answers: Record<string, number> = {};
    for (const q of QUIZ_QUESTIONS) answers[q.id] = -2 * q.direction;
    expect(scoreQuizAnswers(answers)).toBe(-100);
  });

  it("ignores unanswered questions rather than treating them as 0", () => {
    const partial: Record<string, number> = { [QUIZ_QUESTIONS[0].id]: 2 * QUIZ_QUESTIONS[0].direction };
    expect(scoreQuizAnswers(partial)).toBeGreaterThan(0);
  });

  it("clamps to the [-100, 100] range", () => {
    const answers: Record<string, number> = {};
    for (const q of QUIZ_QUESTIONS) answers[q.id] = 2 * q.direction;
    const score = scoreQuizAnswers(answers);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(-100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/compass.test.ts`
Expected: FAIL — `Cannot find module './compass'`

- [ ] **Step 3: Write minimal implementation**

```ts
export interface QuizQuestion {
  id: string;
  statement: string;
  // +1: agreeing shifts the position toward +100 (government-friendly).
  // -1: agreeing shifts the position toward -100 (government-critical).
  direction: 1 | -1;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "scrutiny-in-crisis",
    statement: "The press should scrutinize government decisions even during a national crisis.",
    direction: -1,
  },
  {
    id: "spokesperson-accuracy",
    statement:
      "Government spokespersons generally give a more accurate account of events than independent reporters.",
    direction: 1,
  },
  {
    id: "challenging-officials",
    statement: "Journalists who challenge official statements are performing a valuable public service.",
    direction: -1,
  },
  {
    id: "restraint-for-unity",
    statement:
      "In the interest of national unity, the press should sometimes hold back criticism of the government.",
    direction: 1,
  },
  {
    id: "investigative-reporting",
    statement: "Investigative reporting that embarrasses the government ultimately strengthens democracy.",
    direction: -1,
  },
  {
    id: "trust-when-aligned",
    statement: "I trust a news outlet more when its coverage aligns with the government's version of events.",
    direction: 1,
  },
];

// Each answer is a Likert value in [-2, 2] (strongly disagree..strongly
// agree). Unanswered questions are skipped rather than counted as neutral,
// so the average is only ever taken over questions the user actually
// answered.
export function scoreQuizAnswers(answers: Record<string, number>): number {
  let total = 0;
  let count = 0;
  for (const q of QUIZ_QUESTIONS) {
    const value = answers[q.id];
    if (typeof value !== "number") continue;
    total += value * q.direction;
    count += 1;
  }
  if (count === 0) return 0;
  const avg = total / count; // range [-2, 2]
  const scaled = Math.round(avg * 50); // range [-100, 100]
  return Math.max(-100, Math.min(100, scaled));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/compass.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/compass.ts lib/compass.test.ts
git commit -m "feat: add compass quiz questions and scoring"
```

---

### Task 4: List reorder math

**Files:**
- Create: `lib/lists.ts`
- Test: `lib/lists.test.ts`

**Interfaces:**
- Produces: `ReorderableItem { id: string; position: number }`, `computeReorderedPositions(items: ReorderableItem[], fromIndex: number, toIndex: number): { id: string; position: number }[]`

- [ ] **Step 1: Write the failing test**

```ts
import { computeReorderedPositions } from "./lists";

describe("computeReorderedPositions", () => {
  const items = [
    { id: "a", position: 0 },
    { id: "b", position: 1 },
    { id: "c", position: 2 },
  ];

  it("moves an item from the front to the back", () => {
    const result = computeReorderedPositions(items, 0, 2);
    expect(result).toEqual([
      { id: "b", position: 0 },
      { id: "c", position: 1 },
      { id: "a", position: 2 },
    ]);
  });

  it("moves an item from the back to the front", () => {
    const result = computeReorderedPositions(items, 2, 0);
    expect(result).toEqual([
      { id: "c", position: 0 },
      { id: "a", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("is a no-op when moved to its own position", () => {
    const result = computeReorderedPositions(items, 1, 1);
    expect(result).toEqual([
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("sorts by existing position first, regardless of input array order", () => {
    const shuffled = [items[2], items[0], items[1]];
    const result = computeReorderedPositions(shuffled, 0, 1);
    expect(result).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
      { id: "c", position: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/lists.test.ts`
Expected: FAIL — `Cannot find module './lists'`

- [ ] **Step 3: Write minimal implementation**

```ts
export interface ReorderableItem {
  id: string;
  position: number;
}

export function computeReorderedPositions(
  items: ReorderableItem[],
  fromIndex: number,
  toIndex: number
): { id: string; position: number }[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);
  return ordered.map((item, index) => ({ id: item.id, position: index }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/lists.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/lists.ts lib/lists.test.ts
git commit -m "feat: add list reorder position math"
```

---

### Task 5: Handle and compass query functions

**Files:**
- Modify: `lib/queries.ts`
- Modify: `lib/queries.test.ts`

**Interfaces:**
- Consumes: nothing new (plain Supabase calls, same style as every existing function in this file)
- Produces: `claimHandle(supabase, userId: string, handle: string): Promise<void>`, `setCompassPosition(supabase, userId: string, position: number): Promise<void>`, `fetchPublicProfile(supabase, handle: string): Promise<{ id: string; handle: string; compass_position: number | null } | null>`
- Modifies: the existing `Profile` interface and `fetchProfile` function in `lib/queries.ts` gain a `handle: string | null` field, so screens reading the current user's own profile (Task 10) can read their handle from the query they already make, instead of a second ad hoc Supabase call.

- [ ] **Step 1: Write the failing tests**

First, update the existing `fetchProfile` test's fixture in `lib/queries.test.ts` (the `describe("fetchProfile", ...)` block already in the file) to include `handle` in the profile object it asserts against, since `fetchProfile`'s select list is changing:

```ts
const profile = {
  id: "user-1",
  streak_count: 3,
  longest_streak: 5,
  sides_seen_total: 12,
  notification_opt_in: true,
  notification_hour: 9,
  handle: null,
};
```

This fixture already lives in the `it("returns the profile row", ...)` test inside the existing `describe("fetchProfile", ...)` block — only the object literal changes, the rest of that test is unchanged.

Then add to `lib/queries.test.ts`:

```ts
import { claimHandle, setCompassPosition, fetchPublicProfile } from "./queries";

function makeUpdateMock(result: { data: any; error: any }) {
  const eq = jest.fn().mockResolvedValue(result);
  const update = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ update });
  return { client: { from } as any, from, update, eq };
}

describe("claimHandle", () => {
  it("updates the profile's handle", async () => {
    const { client, from, update, eq } = makeUpdateMock({ data: null, error: null });
    await claimHandle(client, "user-1", "amit_57");
    expect(from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({ handle: "amit_57" });
    expect(eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeUpdateMock({ data: null, error: { message: "duplicate" } });
    await expect(claimHandle(client, "user-1", "amit_57")).rejects.toThrow(
      "Failed to claim handle: duplicate"
    );
  });
});

describe("setCompassPosition", () => {
  it("updates the profile's compass position and taken-at timestamp", async () => {
    const { client, update } = makeUpdateMock({ data: null, error: null });
    await setCompassPosition(client, "user-1", 42);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ compass_position: 42 })
    );
  });
});

describe("fetchPublicProfile", () => {
  function makeSelectMock(result: { data: any; error: any }) {
    const maybeSingle = jest.fn().mockResolvedValue(result);
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from, select, eq };
  }

  it("returns the profile when found", async () => {
    const profile = { id: "user-1", handle: "amit_57", compass_position: 10 };
    const { client, from } = makeSelectMock({ data: profile, error: null });
    const result = await fetchPublicProfile(client, "amit_57");
    expect(from).toHaveBeenCalledWith("public_profiles");
    expect(result).toEqual(profile);
  });

  it("returns null when no profile has that handle", async () => {
    const { client } = makeSelectMock({ data: null, error: null });
    expect(await fetchPublicProfile(client, "nobody")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/queries.test.ts`
Expected: FAIL — `claimHandle` etc. are not exported

- [ ] **Step 3: Add the implementations to `lib/queries.ts`**

First, extend the existing `Profile` interface and `fetchProfile` function (already in the file, before this plan) to include `handle` — replace them with:

```ts
export interface Profile {
  id: string;
  streak_count: number;
  longest_streak: number;
  sides_seen_total: number;
  notification_opt_in: boolean;
  notification_hour: number;
  handle: string | null;
}

export async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, streak_count, longest_streak, sides_seen_total, notification_opt_in, notification_hour, handle"
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch profile: ${error.message}`);
  return data;
}
```

Then append the new functions to the file (after `fetchProfile`):

```ts
export async function claimHandle(supabase: SupabaseClient, userId: string, handle: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ handle }).eq("id", userId);
  if (error) throw new Error(`Failed to claim handle: ${error.message}`);
}

export async function setCompassPosition(
  supabase: SupabaseClient,
  userId: string,
  position: number
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ compass_position: position, compass_quiz_taken_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw new Error(`Failed to save compass position: ${error.message}`);
}

export interface PublicProfile {
  id: string;
  handle: string;
  compass_position: number | null;
}

export async function fetchPublicProfile(
  supabase: SupabaseClient,
  handle: string
): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, handle, compass_position")
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch profile: ${error.message}`);
  return data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/queries.test.ts`
Expected: PASS (all tests, including the new ones)

- [ ] **Step 5: Commit**

```bash
git add lib/queries.ts lib/queries.test.ts
git commit -m "feat: add handle and compass query functions"
```

---

### Task 6: List query functions

**Files:**
- Modify: `lib/queries.ts`
- Modify: `lib/queries.test.ts`

**Interfaces:**
- Consumes: `ReorderableItem` from `lib/lists.ts`, `computeReorderedPositions` from `lib/lists.ts`
- Produces: `ListRow { id, owner_id, name, description, is_public, is_default, created_at }`, `ListItemRow { id, list_id, story_id, position, added_at, story? }`, `createDefaultRepostsList(supabase, userId): Promise<string>`, `createList(supabase, userId, name, description): Promise<string>`, `fetchUserLists(supabase, userId): Promise<ListRow[]>`, `fetchPublicLists(supabase, ownerId): Promise<ListRow[]>`, `fetchListItems(supabase, listId): Promise<ListItemRow[]>`, `addStoryToList(supabase, listId, storyId): Promise<void>`, `removeStoryFromList(supabase, listId, storyId): Promise<void>`, `toggleListPublic(supabase, listId, isPublic): Promise<void>`, `reorderListItems(supabase, updates: { id: string; position: number }[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Add to `lib/queries.test.ts`:

```ts
import {
  createDefaultRepostsList,
  createList,
  fetchUserLists,
  fetchPublicLists,
  fetchListItems,
  addStoryToList,
  removeStoryFromList,
  toggleListPublic,
  reorderListItems,
} from "./queries";

describe("createDefaultRepostsList", () => {
  it("inserts a public, default-flagged list named Reposts", async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: "list-1" }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });
    const client = { from } as any;

    const id = await createDefaultRepostsList(client, "user-1");

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "user-1", name: "Reposts", is_public: true, is_default: true })
    );
    expect(id).toBe("list-1");
  });
});

describe("createList", () => {
  it("inserts a private, non-default list", async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: "list-2" }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });
    const client = { from } as any;

    const id = await createList(client, "user-1", "Stories that changed my mind", null);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: "user-1",
        name: "Stories that changed my mind",
        is_public: false,
        is_default: false,
      })
    );
    expect(id).toBe("list-2");
  });
});

describe("fetchUserLists / fetchPublicLists", () => {
  function makeListsMock(result: { data: any; error: any }) {
    const order = jest.fn().mockResolvedValue(result);
    const eqPublic = jest.fn().mockReturnValue({ order });
    const eqOwner = jest.fn().mockReturnValue({ order, eq: eqPublic });
    const select = jest.fn().mockReturnValue({ eq: eqOwner });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from, select, eqOwner, eqPublic, order };
  }

  it("fetchUserLists filters by owner only", async () => {
    const lists = [{ id: "l1" }];
    const { client, eqOwner } = makeListsMock({ data: lists, error: null });
    const result = await fetchUserLists(client, "user-1");
    expect(eqOwner).toHaveBeenCalledWith("owner_id", "user-1");
    expect(result).toEqual(lists);
  });

  it("fetchPublicLists filters by owner and is_public", async () => {
    const lists = [{ id: "l1", is_public: true }];
    const { client, eqOwner, eqPublic } = makeListsMock({ data: lists, error: null });
    const result = await fetchPublicLists(client, "user-1");
    expect(eqOwner).toHaveBeenCalledWith("owner_id", "user-1");
    expect(eqPublic).toHaveBeenCalledWith("is_public", true);
    expect(result).toEqual(lists);
  });
});

describe("fetchListItems", () => {
  it("returns items ordered by position", async () => {
    const items = [{ id: "i1", position: 0 }];
    const order = jest.fn().mockResolvedValue({ data: items, error: null });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    const client = { from } as any;

    const result = await fetchListItems(client, "list-1");
    expect(eq).toHaveBeenCalledWith("list_id", "list-1");
    expect(order).toHaveBeenCalledWith("position");
    expect(result).toEqual(items);
  });
});

describe("addStoryToList", () => {
  it("computes the next position from the current max and upserts", async () => {
    const limit = jest.fn().mockResolvedValue({ data: [{ position: 2 }], error: null });
    const order = jest.fn().mockReturnValue({ limit });
    const eqSelect = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq: eqSelect });
    const upsert = jest.fn().mockResolvedValue({ data: null, error: null });
    const from = jest.fn().mockReturnValue({ select, upsert });
    const client = { from } as any;

    await addStoryToList(client, "list-1", "story-1");

    expect(upsert).toHaveBeenCalledWith(
      { list_id: "list-1", story_id: "story-1", position: 3 },
      { onConflict: "list_id,story_id", ignoreDuplicates: true }
    );
  });

  it("starts at position 0 for an empty list", async () => {
    const limit = jest.fn().mockResolvedValue({ data: [], error: null });
    const order = jest.fn().mockReturnValue({ limit });
    const eqSelect = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq: eqSelect });
    const upsert = jest.fn().mockResolvedValue({ data: null, error: null });
    const from = jest.fn().mockReturnValue({ select, upsert });
    const client = { from } as any;

    await addStoryToList(client, "list-1", "story-1");

    expect(upsert).toHaveBeenCalledWith(
      { list_id: "list-1", story_id: "story-1", position: 0 },
      { onConflict: "list_id,story_id", ignoreDuplicates: true }
    );
  });
});

describe("removeStoryFromList", () => {
  it("deletes the matching list_items row", async () => {
    const eqStory = jest.fn().mockResolvedValue({ data: null, error: null });
    const eqList = jest.fn().mockReturnValue({ eq: eqStory });
    const del = jest.fn().mockReturnValue({ eq: eqList });
    const from = jest.fn().mockReturnValue({ delete: del });
    const client = { from } as any;

    await removeStoryFromList(client, "list-1", "story-1");
    expect(eqList).toHaveBeenCalledWith("list_id", "list-1");
    expect(eqStory).toHaveBeenCalledWith("story_id", "story-1");
  });
});

describe("toggleListPublic", () => {
  it("updates is_public on the given list", async () => {
    const eq = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });
    const client = { from } as any;

    await toggleListPublic(client, "list-1", true);
    expect(update).toHaveBeenCalledWith({ is_public: true });
    expect(eq).toHaveBeenCalledWith("id", "list-1");
  });
});

describe("reorderListItems", () => {
  it("applies one position update per item", async () => {
    const eq = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });
    const client = { from } as any;

    await reorderListItems(client, [
      { id: "i1", position: 0 },
      { id: "i2", position: 1 },
    ]);

    expect(update).toHaveBeenCalledWith({ position: 0 });
    expect(update).toHaveBeenCalledWith({ position: 1 });
    expect(eq).toHaveBeenCalledWith("id", "i1");
    expect(eq).toHaveBeenCalledWith("id", "i2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/queries.test.ts`
Expected: FAIL — the new functions are not exported

- [ ] **Step 3: Add the implementations to `lib/queries.ts`**

```ts
export interface ListRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  is_default: boolean;
  created_at: string;
}

export interface ListItemRow {
  id: string;
  list_id: string;
  story_id: string;
  position: number;
  added_at: string;
  story?: Story;
}

export async function createDefaultRepostsList(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("lists")
    .insert({ owner_id: userId, name: "Reposts", is_public: true, is_default: true })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create default list: ${error?.message}`);
  return data.id;
}

export async function createList(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  description: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from("lists")
    .insert({ owner_id: userId, name, description, is_public: false, is_default: false })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create list: ${error?.message}`);
  return data.id;
}

export async function fetchUserLists(supabase: SupabaseClient, userId: string): Promise<ListRow[]> {
  const { data, error } = await supabase
    .from("lists")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at");
  if (error) throw new Error(`Failed to fetch lists: ${error.message}`);
  return data ?? [];
}

export async function fetchPublicLists(supabase: SupabaseClient, ownerId: string): Promise<ListRow[]> {
  const { data, error } = await supabase
    .from("lists")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_public", true)
    .order("created_at");
  if (error) throw new Error(`Failed to fetch public lists: ${error.message}`);
  return data ?? [];
}

export async function fetchListItems(supabase: SupabaseClient, listId: string): Promise<ListItemRow[]> {
  const { data, error } = await supabase
    .from("list_items")
    .select("id, list_id, story_id, position, added_at, story:stories(id, canonical_headline, summary, first_seen_at)")
    .eq("list_id", listId)
    .order("position");
  if (error) throw new Error(`Failed to fetch list items: ${error.message}`);
  return (data ?? []) as unknown as ListItemRow[];
}

export async function addStoryToList(supabase: SupabaseClient, listId: string, storyId: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1);
  if (fetchError) throw new Error(`Failed to check list items: ${fetchError.message}`);
  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;
  const { error } = await supabase
    .from("list_items")
    .upsert(
      { list_id: listId, story_id: storyId, position: nextPosition },
      { onConflict: "list_id,story_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(`Failed to add story to list: ${error.message}`);
}

export async function removeStoryFromList(supabase: SupabaseClient, listId: string, storyId: string): Promise<void> {
  const { error } = await supabase.from("list_items").delete().eq("list_id", listId).eq("story_id", storyId);
  if (error) throw new Error(`Failed to remove story from list: ${error.message}`);
}

export async function toggleListPublic(supabase: SupabaseClient, listId: string, isPublic: boolean): Promise<void> {
  const { error } = await supabase.from("lists").update({ is_public: isPublic }).eq("id", listId);
  if (error) throw new Error(`Failed to update list visibility: ${error.message}`);
}

export async function reorderListItems(
  supabase: SupabaseClient,
  updates: { id: string; position: number }[]
): Promise<void> {
  for (const update of updates) {
    const { error } = await supabase.from("list_items").update({ position: update.position }).eq("id", update.id);
    if (error) throw new Error(`Failed to reorder list item ${update.id}: ${error.message}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/queries.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add lib/queries.ts lib/queries.test.ts
git commit -m "feat: add list CRUD query functions"
```

---

### Task 7: Mandatory handle selection in the upgrade flow

**Files:**
- Modify: `app/upgrade.tsx`

**Interfaces:**
- Consumes: `isValidHandle` from `lib/handle.ts`, `claimHandle` and `createDefaultRepostsList` from `lib/queries.ts`, `getUserId` from `lib/auth.ts`

- [ ] **Step 1: Add handle input and submission to the upgrade screen**

Replace the full contents of `app/upgrade.tsx`:

```tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import { isValidHandle } from "../lib/handle";
import { claimHandle, createDefaultRepostsList } from "../lib/queries";

export default function UpgradeScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit() {
    if (!email.trim()) return;
    const trimmedHandle = handle.trim().toLowerCase();
    if (!isValidHandle(trimmedHandle)) {
      setErrorMessage("Handle must be 3-20 characters: lowercase letters, digits, or underscore.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    // Supabase's documented anonymous-user linking flow: calling
    // updateUser({ email }) while signed in anonymously sends a
    // confirmation email and, once confirmed, converts THIS SAME uid to a
    // permanent identified user — every existing profiles/user_story_views
    // row (keyed on that uid) carries over untouched, no data migration.
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    if (error) {
      setErrorMessage(error.message);
      setStatus("error");
      return;
    }
    try {
      const userId = await getUserId(supabase);
      await claimHandle(supabase, userId, trimmedHandle);
      await createDefaultRepostsList(supabase, userId);
    } catch (err) {
      // The email confirmation already sent successfully — a handle/list
      // hiccup here must not block the user from finishing email
      // confirmation. They can pick a handle again from their profile.
      console.error("Failed to claim handle after upgrade:", err);
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Check your email</Text>
        <Text style={{ marginTop: 8, color: "#555" }}>
          Tap the confirmation link we sent to {email.trim()}, then reopen Sourced. Your streak,
          reading history, and new handle carry over exactly as they are.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: "600" }}>Save your progress</Text>
      <Text style={{ marginTop: 8, color: "#555" }}>
        Add an email so your streak and reading history aren't lost if you reinstall, and pick a
        handle so you can share lists and your profile publicly.
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ marginTop: 16, borderWidth: 1, borderColor: "#ccc", borderRadius: 4, padding: 12 }}
      />
      <TextInput
        value={handle}
        onChangeText={setHandle}
        placeholder="handle (lowercase, 3-20 chars)"
        autoCapitalize="none"
        style={{ marginTop: 12, borderWidth: 1, borderColor: "#ccc", borderRadius: 4, padding: 12 }}
      />
      {status === "error" ? (
        <Text style={{ marginTop: 8, color: "#a00" }}>Couldn't save that: {errorMessage}</Text>
      ) : null}
      <View style={{ flexDirection: "row", marginTop: 16, gap: 16 }}>
        <Pressable onPress={handleSubmit} disabled={status === "submitting"}>
          <Text style={{ color: "#0066cc", fontWeight: "600" }}>
            {status === "submitting" ? "Sending..." : "Send confirmation link"}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#777" }}>Maybe later</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manually verify via the dev-client build**

Run `npx expo start --dev-client`, open the app, trigger the upgrade prompt (streak ≥ 3), submit an email and a handle, confirm no crash and the "Check your email" screen renders.

- [ ] **Step 4: Commit**

```bash
git add app/upgrade.tsx
git commit -m "feat: add mandatory handle selection to account upgrade"
```

---

### Task 8: Quiz screen

**Files:**
- Create: `app/quiz.tsx`

**Interfaces:**
- Consumes: `QUIZ_QUESTIONS`, `scoreQuizAnswers` from `lib/compass.ts`; `setCompassPosition` from `lib/queries.ts`; `getUserId` from `lib/auth.ts`

- [ ] **Step 1: Write the quiz screen**

```tsx
import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import { QUIZ_QUESTIONS, scoreQuizAnswers } from "../lib/compass";
import { setCompassPosition } from "../lib/queries";

const LIKERT_OPTIONS: { label: string; value: number }[] = [
  { label: "Strongly disagree", value: -2 },
  { label: "Disagree", value: -1 },
  { label: "Neutral", value: 0 },
  { label: "Agree", value: 1 },
  { label: "Strongly agree", value: 2 },
];

export default function QuizScreen() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [resultPosition, setResultPosition] = useState<number | null>(null);

  const allAnswered = QUIZ_QUESTIONS.every((q) => typeof answers[q.id] === "number");

  async function handleSubmit() {
    setStatus("submitting");
    const position = scoreQuizAnswers(answers);
    try {
      const userId = await getUserId(supabase);
      await setCompassPosition(supabase, userId, position);
    } catch (err) {
      console.error("Failed to save compass position:", err);
    }
    setResultPosition(position);
    setStatus("done");
  }

  if (status === "done" && resultPosition !== null) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Your position: {resultPosition}</Text>
        <Text style={{ marginTop: 8, color: "#555" }}>
          -100 is government-critical, +100 is government-friendly. This is a badge, not a filter
          — it never changes which stories or outlets you see.
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "#0066cc", fontWeight: "600" }}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Where do you stand?</Text>
      <Text style={{ marginTop: 8, color: "#555" }}>
        This never changes what you're shown — it's a badge for your profile, not a filter.
      </Text>
      {QUIZ_QUESTIONS.map((q) => (
        <View key={q.id} style={{ marginTop: 20 }}>
          <Text style={{ fontWeight: "600" }}>{q.statement}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {LIKERT_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: option.value }))}
                style={{
                  borderWidth: 1,
                  borderColor: answers[q.id] === option.value ? "#0066cc" : "#ccc",
                  borderRadius: 4,
                  padding: 8,
                }}
              >
                <Text style={{ color: answers[q.id] === option.value ? "#0066cc" : "#333" }}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Pressable
        onPress={handleSubmit}
        disabled={!allAnswered || status === "submitting"}
        style={{ marginTop: 24, marginBottom: 40 }}
      >
        <Text style={{ color: allAnswered ? "#0066cc" : "#aaa", fontWeight: "600" }}>
          {status === "submitting" ? "Saving..." : "See my position"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manually verify via the dev-client build**

Navigate to `/quiz` (add a temporary link if no nav entry exists yet — Task 10 wires the real entry point), answer all 6 questions, confirm the result screen shows a position in `[-100, 100]` and the profile's `compass_position` updates in the Supabase Table Editor.

- [ ] **Step 4: Commit**

```bash
git add app/quiz.tsx
git commit -m "feat: add compass quiz screen"
```

---

### Task 9: Profile screen

**Files:**
- Create: `app/profile/[handle].tsx`

**Interfaces:**
- Consumes: `fetchPublicProfile`, `fetchPublicLists`, `fetchUserLists`, `fetchListItems`, `toggleListPublic` from `lib/queries.ts`; `getUserId` from `lib/auth.ts`

- [ ] **Step 1: Write the profile screen**

```tsx
import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getUserId } from "../../lib/auth";
import {
  fetchPublicProfile,
  fetchPublicLists,
  fetchUserLists,
  PublicProfile,
  ListRow,
} from "../../lib/queries";

export default function ProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) return;
    (async () => {
      try {
        const found = await fetchPublicProfile(supabase, handle);
        if (!found) {
          setError("No profile with that handle.");
          setLoading(false);
          return;
        }
        setProfile(found);

        const userId = await getUserId(supabase);
        const own = userId === found.id;
        setIsOwnProfile(own);

        const visibleLists = own
          ? await fetchUserLists(supabase, found.id)
          : await fetchPublicLists(supabase, found.id);
        setLists(visibleLists);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [handle]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (error || !profile) return <Text style={{ padding: 16 }}>{error ?? "Profile not found."}</Text>;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>@{profile.handle}</Text>
      {profile.compass_position !== null ? (
        <Text style={{ marginTop: 4, color: "#555" }}>
          Compass position: {profile.compass_position}
        </Text>
      ) : null}
      {isOwnProfile ? (
        <Pressable onPress={() => router.push("/quiz")} style={{ marginTop: 8 }}>
          <Text style={{ color: "#0066cc" }}>Retake the quiz →</Text>
        </Pressable>
      ) : null}
      <Text style={{ marginTop: 20, fontWeight: "600" }}>
        {isOwnProfile ? "Your lists" : "Public lists"}
      </Text>
      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee" }}>
            <Text style={{ fontWeight: "500" }}>{item.name}</Text>
            {item.description ? <Text style={{ color: "#777" }}>{item.description}</Text> : null}
            {!item.is_public ? <Text style={{ fontSize: 11, color: "#a00" }}>Private</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: "#777", marginTop: 8 }}>No lists yet.</Text>}
      />
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manually verify via the dev-client build**

Navigate to `/profile/<your-handle>` after completing the upgrade flow (Task 7). Confirm the handle, compass position (if set), and the default "Reposts" list all render. Confirm a stranger's handle correctly shows `isOwnProfile = false` (no "Retake the quiz" link).

- [ ] **Step 4: Commit**

```bash
git add app/profile/[handle].tsx
git commit -m "feat: add public/own profile screen"
```

---

### Task 10: Wire navigation and repost action

**Files:**
- Modify: `app/_layout.tsx`
- Modify: `app/index.tsx`

**Interfaces:**
- Consumes: `addStoryToList`, `fetchUserLists` from `lib/queries.ts`

- [ ] **Step 1: Register the new routes**

In `app/_layout.tsx`, add two `Stack.Screen` entries:

```tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Today's Stories" }} />
      <Stack.Screen name="story/[id]" options={{ title: "Story" }} />
      <Stack.Screen name="methodology" options={{ title: "Methodology" }} />
      <Stack.Screen name="upgrade" options={{ title: "Save your progress" }} />
      <Stack.Screen name="quiz" options={{ title: "Where do you stand?" }} />
      <Stack.Screen name="profile/[handle]" options={{ title: "Profile" }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Add a "My profile" entry point and per-story repost action to the feed**

In `app/index.tsx`, add near the existing methodology link (inside the `ListHeaderComponent`'s `View`, after the methodology `Pressable`) — note this requires knowing the current user's own handle, which isn't fetched today; extend the existing profile-fetching `useEffect` to also track it:

Add to the imports:
```ts
import { fetchProfile, ... } from "../lib/queries"; // existing import, no change
import { addStoryToList, fetchUserLists } from "../lib/queries";
```

Add a new state field and repost handler inside `FeedScreen`:
```tsx
const [ownHandle, setOwnHandle] = useState<string | null>(null);
const [repostsListId, setRepostsListId] = useState<string | null>(null);
```

In the existing `getUserId(supabase).then(async (id) => { ... })` block, after `const p = await fetchProfile(supabase, id); setProfile(p);`, add (this reads `p.handle`, which Task 5 added to `fetchProfile`'s existing return shape — no second query needed):
```tsx
if (p?.handle) {
  setOwnHandle(p.handle);
  const lists = await fetchUserLists(supabase, id);
  const reposts = lists.find((l) => l.is_default);
  if (reposts) setRepostsListId(reposts.id);
}
```

Add a repost handler function inside `FeedScreen`:
```tsx
async function handleRepost(storyId: string) {
  if (!repostsListId) return;
  try {
    await addStoryToList(supabase, repostsListId, storyId);
  } catch (err) {
    console.error("Failed to repost story:", err);
  }
}
```

Add a "My profile" link in the header `View`, right after the methodology `Pressable`:
```tsx
{ownHandle ? (
  <Pressable onPress={() => router.push(`/profile/${ownHandle}`)} style={{ padding: 16, paddingTop: 0 }}>
    <Text style={{ color: "#0066cc" }}>My profile →</Text>
  </Pressable>
) : null}
```

Add a repost button inside the story `renderItem`, after the summary `Text`:
```tsx
{repostsListId ? (
  <Pressable
    onPress={(e) => {
      e.stopPropagation();
      handleRepost(item.id);
    }}
    style={{ marginTop: 6 }}
  >
    <Text style={{ fontSize: 12, color: "#0066cc" }}>Repost to my profile</Text>
  </Pressable>
) : null}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manually verify via the dev-client build**

As an upgraded user with a handle, confirm "My profile →" appears and navigates correctly, and tapping "Repost to my profile" on a story adds it to the Reposts list (verify via the profile screen or Supabase Table Editor).

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx app/index.tsx
git commit -m "feat: wire profile navigation and repost action into the feed"
```

---

### Task 11: Methodology promise copy

**Files:**
- Modify: `app/methodology.tsx`

- [ ] **Step 1: Insert the new section**

In `app/methodology.tsx`, insert a new section between the existing "YouTube-lite inclusion criteria" section and the closing `{loading ? ... : null}` line:

```tsx
      <Text style={{ fontSize: 16, fontWeight: "600", marginTop: 20 }}>Political compass</Text>
      <Text style={{ marginTop: 4, color: "#333" }}>
        Your compass position (from the quiz on your profile) never changes which stories or
        outlets you're shown. It's a badge you can choose to share, not a filter — this app
        doesn't personalize your feed based on it. It also only moves in small steps over time,
        driven by your own outlet-poll answers, never by which articles you happen to read.
      </Text>

      {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : null}
```

This replaces the file's existing final line (`{loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : null}`) with the new section followed by that same line.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manually verify**

Open `/methodology` in the dev-client build, confirm the new paragraph renders.

- [ ] **Step 4: Commit**

```bash
git add app/methodology.tsx
git commit -m "docs: state the compass never filters content, on the methodology page"
```

---

## Self-Review Notes

- **Spec coverage:** §1 Identity & Auth → Tasks 1, 2, 7. §2 Profile Pages → Task 9. §3 Curated Lists & Reposts → Tasks 1, 4, 6, 10. §4 Quiz (static position) → Tasks 1, 3, 8, 11. Drift (§5) is intentionally out of this plan's scope — see `2026-08-26-compass-drift.md`. Feed topics (§6) and chat (§7) are separate plans/out of scope per the cut order.
- **RLS ownership check:** every mutating query function in Tasks 5-6 relies on the RLS policies from Task 1 to actually enforce ownership — the client-side code never checks `owner_id === auth.uid()` itself, matching the codebase's existing convention of trusting RLS as the enforcement layer (see `outlet_poll_responses`).
- **Hard constraint reminder:** no task in this plan reads `compass_position` anywhere except to *display* it (Task 9's profile screen, Task 8's quiz result). Confirm this stays true in code review.
