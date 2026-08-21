# Week 3: Engagement, Growth Loop & Framing Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the one known live bug (silence-signal pagination has no deterministic order, so it hits its safety ceiling on every load), extend the already-shipped headline-comparison feature into the spec's standalone "headline framing comparison" stretch item, then build the CB engagement core (anonymous auth, "sides seen" streaks, ethical-copy daily digest notification), the anonymous-to-account upgrade flow, and WhatsApp share cards. Tasks 12-13 (fact-checker cross-referencing, reader quick-polls) are stretch, in the same cut-from-the-bottom order the spec assigns them — build Tasks 1-11 first and treat 12-13 as time-permitting.

**Architecture:** Extends the existing Node/TypeScript `scripts/` pipeline and Expo Router app with one new capability class: real user identity. Supabase anonymous auth (`signInAnonymously`) gives every install a stable `auth.uid()` from first launch, with zero signup friction — the same UID persists through an optional later upgrade to a linked email account, so no separate device-ID scheme is needed. Two new tables (`profiles`, `user_story_views`) are owned entirely by RLS keyed on `auth.uid()` — the app writes them directly with the anon key, no service-role code path, matching this project's "no custom backend" architecture (spec §6). Streak/sides-seen computation is a pure, tested module (`lib/streak.ts`) fed by a bounded per-user query, mirroring the existing pure-logic/I/O-wrapper split (`lib/silence.ts` + `lib/queries.ts`). The daily digest is a **local, on-device notification** (not a server-push pipeline): Expo Go on Android has not supported remote push since SDK 53, this project's final distribution is a sideloaded APK with no push-token backend, and a one-shot local notification rescheduled with fresh copy on every app open is simpler, free, and fully testable throughout development — a deliberate, documented scope call, not an oversight. WhatsApp share cards are **rich formatted text**, not a rendered image: the project has taken no native-module dependency beyond Expo's own packages through Weeks 1-2, and pulling in an image-capture library now would be the first departure from that (risking the plain-Expo-Go dev loop) for a v1 that isn't distributed via a store anyway (sideload only, no working deep link target for a shared card to open).

**Tech Stack:** Adds `@supabase/supabase-js` auth (already a dependency), `@react-native-async-storage/async-storage` + `react-native-url-polyfill` (Supabase's documented React Native session-persistence requirement), `expo-notifications` (local notifications only). Everything else — Node/TypeScript scripts, Supabase Postgres + RLS, Gemini API, GitHub Actions, Jest + ts-jest — is unchanged from Weeks 1-2.

**Spec:** `docs/superpowers/specs/2026-08-15-india-news-transparency-app-design.md`

## Global Constraints

- Budget: free-tier-first, cap ₹5,000 total (unchanged). No new paid service is introduced by this plan.
- No secrets committed to git. This plan needs no new GitHub Actions secrets — everything here runs client-side in the app or is a one-time Supabase dashboard toggle.
- Supabase RLS must be enabled on every new table. Unlike Weeks 1-2 (public-read, service-role-write), the two engagement tables (`profiles`, `user_story_views`) are **owned by their user** — every policy is `using (auth.uid() = ...)`, no public-read policy on them.
- **Manual one-time step, not automatable from code:** In the Supabase dashboard, go to **Authentication → Sign In / Providers** and enable **Anonymous Sign-Ins**. Task 3 fails at runtime until this is on.
- Gemini's `generateContent` quota (~20/day) and its **separate** embedding quota (`EmbedContentRequestsPerDayPerProjectPerModel-FreeTier`, 1,000/day) are both scarce — learned live during Week 2. Task 12 (fact-checker matching) is the only task in this plan that calls the embedding API; it stays on a small daily batch specifically because of this.
- Ethical Nudge Charter (spec §7.3) is a hard constraint on every string a user reads outside the core coverage data: promotion-framed, never loss-framed; no fear/urgency words; every nudge dismissible without nagging. Tasks 8 and 11 encode this as a tested guard function (`assertEthicalCopy`), not just a style guideline.
- Ownership/press-freedom neutral-wording rule from Weeks 1-2 (`"owned by," never "controlled by"`) is unchanged and untouched by this plan — no task here modifies `outlets.ownership`.
- Out of scope for this plan (per explicit user instruction): Hindi-lite, final APK build, demo rehearsal, visual polish pass — these are spec §9's Day 21 buffer, a separate later effort.

---

## Task 1: Fix silence-signal active-outlet scan — add deterministic pagination order

**Files:**
- Modify: `lib/queries.ts`
- Modify: `lib/queries.test.ts`

**Interfaces:**
- No signature change to `fetchSilentOutlets` — internal fix only.

**Bug being fixed:** The active-outlet scan inside `fetchSilentOutlets` pages through `articles` with `.range()` but **no `.order()` clause at all**. Live testing today confirmed this now hits its 5000-row safety ceiling on every page load, because a large backlog import left long runs of same-outlet rows returned in an undefined order — so the early-exit ("stop once every outlet has been seen") can't fire and the scan burns through all 10 pages every time. `scripts/cluster/clusterStories.ts` and `scripts/conflict/flagStoryConflicts.ts` already solved this exact problem for their own paginated scans with `.order("<recency column>", { ascending: false }).order("id")` — apply the same tiebreaker pattern here.

- [ ] **Step 1: Write the failing test**

In `lib/queries.test.ts`, inside the `describe("fetchSilentOutlets", ...)` block, add this test after the existing `"returns outlets that are active but not covering..."` test (the mock's `CHAIN_METHODS` array already includes `"order"`, so no change is needed there):

```typescript
  it("orders the active-outlet scan deterministically, matching the clusterStories/flagStoryConflicts tiebreaker pattern", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "outlets") {
        return { data: [{ id: "o1", name: "A", is_youtube: false }], error: null };
      }
      if (isActiveScan(q)) return { data: [{ outlet_id: "o1" }], error: null };
      return { data: [], error: null };
    });

    await fetchSilentOutlets(client, "story-1", oldFirstSeen());

    const scanQuery = queries.find((q) => q.table === "articles" && isActiveScan(q))!;
    const orderCalls = scanQuery.calls.filter((c) => c.method === "order").map((c) => c.args);
    expect(orderCalls).toEqual([
      ["created_at", { ascending: false }],
      ["id"],
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- queries`
Expected: FAIL — the new test finds zero `order` calls on the scan query.

- [ ] **Step 3: Implement the fix**

In `lib/queries.ts`, inside `fetchSilentOutlets`, find the active-outlet scan query:

```typescript
    const { data: page, error: activeError } = await supabase
      .from("articles")
      .select("outlet_id")
      .gte("created_at", activeCutoff)
      .range(offset, offset + ACTIVE_PAGE_SIZE - 1);
```

Replace with:

```typescript
    const { data: page, error: activeError } = await supabase
      .from("articles")
      .select("outlet_id")
      .gte("created_at", activeCutoff)
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + ACTIVE_PAGE_SIZE - 1);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- queries`
Expected: PASS (all existing `fetchSilentOutlets` tests plus the new one).

- [ ] **Step 5: Verify against the real Supabase project**

Run: `npm test` (full suite, sanity check), then start the app (`npx expo start`, press `w`) and open a story page. Expected: no `"safety ceiling"` warning in the console for a story where every active outlet is genuinely covering or genuinely silent — confirms the early-exit now fires instead of scanning all 10 pages.

- [ ] **Step 6: Commit**

```bash
git add lib/queries.ts lib/queries.test.ts
git commit -m "fix: order the silence-signal active-outlet scan deterministically"
```

---

## Task 2: Extend headline comparison into a standalone framing-comparison section

**Files:**
- Modify: `lib/comparison.ts`
- Modify: `lib/comparison.test.ts`
- Modify: `app/story/[id].tsx`

**Interfaces:**
- Produces: `pickFramingSpectrum(articles: ArticleWithOutlet[]): ArticleWithOutlet[]` — added alongside the existing `pickComparisonArticles` (unchanged, still used for the conflict-triggered inline comparison).
- Consumes: `ArticleWithOutlet`, `OutletInfo` (`lib/types.ts`, unchanged).

**Why this closes spec §9 Day 18 instead of building it from scratch:** `lib/comparison.ts` already picks the most govt-lean-divergent *other* outlets relative to one flagged outlet, and it's already wired into the Story screen — but only inside a conflict-of-interest flag's row. The spec's Day 18 item, "headline framing comparison," is a general product feature (see any two outlets' framing of the same story side by side), not conditional on a conflict flag. This task adds one small pure function that finds the two most divergent outlets **in the whole story**, independent of any flag, and surfaces it as its own section — reusing the exact scoring logic instead of writing a second comparison feature.

- [ ] **Step 1: Write the failing tests**

Add to `lib/comparison.test.ts`, after the existing `describe("pickComparisonArticles", ...)` block:

```typescript
describe("pickFramingSpectrum", () => {
  it("picks the two articles whose outlets have the widest govt-lean gap", () => {
    const low = makeArticle({ outlet: makeOutlet({ id: "low", govt_lean_score: 10 }) });
    const mid = makeArticle({ outlet: makeOutlet({ id: "mid", govt_lean_score: 50 }) });
    const high = makeArticle({ outlet: makeOutlet({ id: "high", govt_lean_score: 90 }) });

    const result = pickFramingSpectrum([mid, low, high]);

    expect(result.map((a) => a.outlet!.id)).toEqual(["low", "high"]);
  });

  it("falls back to the first two distinct-outlet articles when fewer than 2 outlets have a score", () => {
    const a = makeArticle({ outlet: makeOutlet({ id: "a", govt_lean_score: null }) });
    const b = makeArticle({ outlet: makeOutlet({ id: "b", govt_lean_score: null }) });
    const c = makeArticle({ outlet: makeOutlet({ id: "c", govt_lean_score: null }) });

    const result = pickFramingSpectrum([a, b, c]);

    expect(result.map((art) => art.outlet!.id)).toEqual(["a", "b"]);
  });

  it("uses one scored outlet plus the most-divergent-by-position unscored outlet when only one outlet has a score", () => {
    const scored = makeArticle({ outlet: makeOutlet({ id: "scored", govt_lean_score: 70 }) });
    const unscored = makeArticle({ outlet: makeOutlet({ id: "unscored", govt_lean_score: null }) });

    const result = pickFramingSpectrum([scored, unscored]);

    expect(result.map((art) => art.outlet!.id)).toEqual(["scored", "unscored"]);
  });

  it("returns an empty array when fewer than 2 distinct outlets cover the story", () => {
    const only = makeArticle({ outlet: makeOutlet({ id: "only", govt_lean_score: 50 }) });
    expect(pickFramingSpectrum([only])).toEqual([]);
  });

  it("skips articles with a null outlet", () => {
    const a = makeArticle({ outlet: makeOutlet({ id: "a", govt_lean_score: 10 }) });
    const nullOutletArticle: ArticleWithOutlet = {
      id: "no-outlet",
      title: "Orphan article",
      url: "https://example.com/orphan",
      published_at: null,
      outlet: null,
    };
    const b = makeArticle({ outlet: makeOutlet({ id: "b", govt_lean_score: 90 }) });

    const result = pickFramingSpectrum([a, nullOutletArticle, b]);

    expect(result.map((art) => art.outlet!.id)).toEqual(["a", "b"]);
  });

  it("keeps only one article per outlet, preferring each outlet's first-listed article", () => {
    const a1 = makeArticle({ id: "a1", outlet: makeOutlet({ id: "a", govt_lean_score: 10 }) });
    const a2 = makeArticle({ id: "a2", outlet: makeOutlet({ id: "a", govt_lean_score: 10 }) });
    const b = makeArticle({ outlet: makeOutlet({ id: "b", govt_lean_score: 90 }) });

    const result = pickFramingSpectrum([a1, a2, b]);

    expect(result.map((art) => art.id)).toEqual(["a1", "b"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- comparison`
Expected: FAIL — `pickFramingSpectrum` is not exported.

- [ ] **Step 3: Implement**

Add to `lib/comparison.ts`, below the existing `pickComparisonArticles` function:

```typescript
/**
 * One article per outlet, whole-story framing comparison — independent of
 * any conflict-of-interest flag (unlike pickComparisonArticles, which is
 * always relative to one flagged outlet). Picks the two outlets whose
 * govt-lean scores are furthest apart, so the two headlines shown are the
 * most likely to actually read differently.
 */
export function pickFramingSpectrum(articles: ArticleWithOutlet[]): ArticleWithOutlet[] {
  const seenOutlets = new Set<string>();
  const onePerOutlet: ArticleWithOutlet[] = [];
  for (const article of articles) {
    if (!article.outlet || seenOutlets.has(article.outlet.id)) continue;
    seenOutlets.add(article.outlet.id);
    onePerOutlet.push(article);
  }
  if (onePerOutlet.length < 2) return [];

  const scored = onePerOutlet.filter((a) => a.outlet!.govt_lean_score !== null);
  if (scored.length >= 2) {
    let widestPair: [ArticleWithOutlet, ArticleWithOutlet] = [scored[0], scored[1]];
    let widestGap = -1;
    for (let i = 0; i < scored.length; i++) {
      for (let j = i + 1; j < scored.length; j++) {
        const gap = Math.abs(scored[i].outlet!.govt_lean_score! - scored[j].outlet!.govt_lean_score!);
        if (gap > widestGap) {
          widestGap = gap;
          widestPair = [scored[i], scored[j]];
        }
      }
    }
    widestPair.sort((a, b) => a.outlet!.govt_lean_score! - b.outlet!.govt_lean_score!);
    return widestPair;
  }

  return onePerOutlet.slice(0, 2);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- comparison`
Expected: PASS (all existing tests plus the 6 new ones).

- [ ] **Step 5: Add the framing-comparison section to the Story screen**

In `app/story/[id].tsx`, add the import:

```typescript
import { pickComparisonArticles, pickFramingSpectrum } from "../../lib/comparison";
```

Just after the `const flagsByOutlet = ...` line and before the `return (`, add:

```typescript
  const framingSpectrum = pickFramingSpectrum(articles);
```

Inside the returned `<ScrollView>`, immediately after the `{story.summary ? ... : null}` block and before the `<Text style={{ marginTop: 24, fontWeight: "600" }}>Sources ({articles.length})</Text>` line, add:

```tsx
      {framingSpectrum.length === 2 ? (
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontWeight: "600" }}>Compare framing</Text>
          <Text style={{ fontSize: 12, color: "#777", marginTop: 2 }}>
            How the two most differently-scored outlets covering this story headlined it:
          </Text>
          {framingSpectrum.map((article) => (
            <Pressable
              key={article.id}
              onPress={() => Linking.openURL(article.url)}
              style={{ marginTop: 8 }}
            >
              <Text style={{ fontWeight: "500" }}>{article.outlet?.name}</Text>
              <Text style={{ color: "#333" }}>{article.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
```

- [ ] **Step 6: Manual verification**

Run: `npx expo start`, press `w`. Open a story with ≥2 outlets that have differing `govt_lean_score` values. Expected: a "Compare framing" section appears above the Sources list showing the two most divergent outlets' headlines, tappable to open the original article.

- [ ] **Step 7: Commit**

```bash
git add lib/comparison.ts lib/comparison.test.ts app/story/[id].tsx
git commit -m "feat: add standalone headline framing comparison section"
```

---

## Task 3: Engagement schema migration — profiles and sides-seen tracking

**Files:**
- Create: `supabase/migrations/0003_engagement.sql`

**Interfaces:**
- Produces: `profiles` table (`id` = `auth.users.id`, `streak_count`, `longest_streak`, `sides_seen_total`, `notification_opt_in`, `notification_hour`) and `user_story_views` table (`user_id`, `story_id`, `outlet_id`, `viewed_at`, unique per triple) — consumed by Task 6's query functions.

- [ ] **Step 1: Enable anonymous sign-ins (manual dashboard step)**

In the Supabase dashboard, go to **Authentication → Sign In / Providers**, find **Anonymous Sign-Ins**, and toggle it on. Nothing in this plan works without this — `signInAnonymously()` (Task 4) fails with a disabled-provider error until it's on.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0003_engagement.sql`:

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  streak_count int not null default 0,
  longest_streak int not null default 0,
  sides_seen_total int not null default 0,
  notification_opt_in boolean not null default false,
  notification_hour int not null default 9,
  created_at timestamptz not null default now()
);

create table user_story_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references stories(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (user_id, story_id, outlet_id)
);

alter table profiles enable row level security;
alter table user_story_views enable row level security;

-- Unlike Weeks 1-2's public-read/service-role-write tables, these two are
-- owned entirely by the user they belong to — every policy is scoped to
-- auth.uid(), and there is no public-read policy at all.
create policy "users manage own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "users manage own views" on user_story_views
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create a profile row the instant a user (anonymous or permanent)
-- is created, so the app never has to race an insert against RLS on first
-- use, and so an anonymous-to-permanent upgrade (which keeps the same
-- auth.users.id) never orphans its existing profile row.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

- [ ] **Step 3: Apply the migration**

In the Supabase dashboard, open **SQL Editor** → **New query**, paste the contents of `0003_engagement.sql`, and click **Run**. Expected: "Success. No rows returned." Confirm `profiles` and `user_story_views` appear in **Table Editor**.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_engagement.sql
git commit -m "feat: add profiles and user_story_views schema for the engagement layer"
```

---

## Task 4: Anonymous auth bootstrap with session persistence

**Files:**
- Modify: `lib/supabase.ts`
- Create: `lib/auth.ts`
- Create: `lib/auth.test.ts`
- Modify: `package.json` (dependencies)

**Interfaces:**
- Consumes: `profiles` auto-creation trigger (Task 3).
- Produces: `ensureAnonymousSession(supabase): Promise<string>` and `getUserId(supabase): Promise<string>` (cached) — consumed by Tasks 6, 7, 9, 10.

- [ ] **Step 1: Install session-persistence dependencies**

```bash
npx expo install @react-native-async-storage/async-storage react-native-url-polyfill
```

- [ ] **Step 2: Configure the Supabase client for React Native session persistence**

Replace the full contents of `lib/supabase.ts`:

```typescript
import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase's documented React Native pattern: pause/resume the auth
// auto-refresh timer with app foreground state, so a backgrounded app
// doesn't keep refreshing tokens it isn't using.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
```

- [ ] **Step 3: Write the failing test for the auth bootstrap**

Create `lib/auth.test.ts`:

```typescript
import { ensureAnonymousSession } from "./auth";

function makeMockSupabase(opts: {
  existingSession?: { user: { id: string } } | null;
  signInResult?: { user: { id: string } | null };
  getSessionError?: { message: string };
  signInError?: { message: string };
}) {
  const getSession = jest.fn().mockResolvedValue({
    data: { session: opts.existingSession ?? null },
    error: opts.getSessionError ?? null,
  });
  const signInAnonymously = jest.fn().mockResolvedValue({
    data: opts.signInResult ?? { user: null },
    error: opts.signInError ?? null,
  });
  return { client: { auth: { getSession, signInAnonymously } } as any, getSession, signInAnonymously };
}

describe("ensureAnonymousSession", () => {
  it("returns the existing session's user id without signing in again", async () => {
    const { client, signInAnonymously } = makeMockSupabase({
      existingSession: { user: { id: "existing-user" } },
    });
    const userId = await ensureAnonymousSession(client);
    expect(userId).toBe("existing-user");
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when there is no existing session", async () => {
    const { client } = makeMockSupabase({
      existingSession: null,
      signInResult: { user: { id: "new-anon-user" } },
    });
    const userId = await ensureAnonymousSession(client);
    expect(userId).toBe("new-anon-user");
  });

  it("throws when checking for a session fails", async () => {
    const { client } = makeMockSupabase({ getSessionError: { message: "boom" } });
    await expect(ensureAnonymousSession(client)).rejects.toThrow("Failed to check session: boom");
  });

  it("throws when anonymous sign-in fails", async () => {
    const { client } = makeMockSupabase({ existingSession: null, signInError: { message: "boom" } });
    await expect(ensureAnonymousSession(client)).rejects.toThrow(
      "Failed to sign in anonymously: boom"
    );
  });

  it("throws when anonymous sign-in returns no user", async () => {
    const { client } = makeMockSupabase({ existingSession: null, signInResult: { user: null } });
    await expect(ensureAnonymousSession(client)).rejects.toThrow(
      "Anonymous sign-in returned no user"
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- auth`
Expected: FAIL — `Cannot find module './auth'`.

- [ ] **Step 5: Implement**

Create `lib/auth.ts`:

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

export async function ensureAnonymousSession(supabase: SupabaseClient): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Failed to check session: ${sessionError.message}`);
  if (sessionData.session) {
    // A confirmed-email upgrade (Task 10) can complete out-of-band (the
    // user taps a link in their email client, not inside this app). This
    // refresh is a best-effort pickup of that change on next app open —
    // never fatal, since the existing session is still perfectly usable
    // either way.
    await supabase.auth.refreshSession().catch(() => {});
    return sessionData.session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`Failed to sign in anonymously: ${error.message}`);
  if (!data.user) throw new Error("Anonymous sign-in returned no user");
  return data.user.id;
}

let cachedUserId: Promise<string> | null = null;

// Memoized so every screen can call this cheaply without re-hitting
// getSession() on every render — one bootstrap per app lifetime.
export function getUserId(supabase: SupabaseClient): Promise<string> {
  if (!cachedUserId) cachedUserId = ensureAnonymousSession(supabase);
  return cachedUserId;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- auth`
Expected: PASS (5 tests).

- [ ] **Step 7: Verify against the real Supabase project**

Run: `npx expo start`, press `w`. Open the browser console — no errors about missing auth config. In the Supabase dashboard, **Authentication → Users**, confirm a new anonymous user appears after the app loads, and in **Table Editor → profiles**, confirm a matching row was auto-created by the trigger.

- [ ] **Step 8: Commit**

```bash
git add lib/supabase.ts lib/auth.ts lib/auth.test.ts package.json package-lock.json
git commit -m "feat: bootstrap anonymous auth with persisted RN sessions"
```

---

## Task 5: Streak and sides-seen computation (pure, tested)

**Files:**
- Create: `lib/streak.ts`
- Create: `lib/streak.test.ts`

**Interfaces:**
- Produces: `ViewRow { story_id: string; outlet_id: string; viewed_at: string }`, `computeStreak(rows: ViewRow[], now?: Date): number`, `computeSidesSeenTotal(rows: ViewRow[]): number` — consumed by Task 6.

**Design:** "Sides seen" (spec §7.2/§7.3: streak tied to sides seen, not raw opens) is defined here as a **comparison day** — a calendar date (UTC, to keep this deterministic and testable rather than depending on device timezone) on which the user viewed articles from ≥2 distinct outlets covering the *same* story. That's the one behavior the whole product exists to encourage, so it's what the mastery signal rewards — not merely opening the app or reading unrelated articles.

- [ ] **Step 1: Write the failing tests**

Create `lib/streak.test.ts`:

```typescript
import { computeStreak, computeSidesSeenTotal, ViewRow } from "./streak";

function view(story: string, outlet: string, date: string): ViewRow {
  return { story_id: story, outlet_id: outlet, viewed_at: `${date}T10:00:00Z` };
}

describe("computeStreak", () => {
  it("counts consecutive days ending today where 2+ outlets were seen on one story", () => {
    const rows = [
      view("s1", "a", "2026-08-19"),
      view("s1", "b", "2026-08-19"),
      view("s2", "a", "2026-08-20"),
      view("s2", "b", "2026-08-20"),
      view("s3", "a", "2026-08-21"),
      view("s3", "b", "2026-08-21"),
    ];
    const streak = computeStreak(rows, new Date("2026-08-21T18:00:00Z"));
    expect(streak).toBe(3);
  });

  it("does not count a day where only one outlet was seen on any story", () => {
    const rows = [view("s1", "a", "2026-08-20"), view("s2", "a", "2026-08-21")];
    const streak = computeStreak(rows, new Date("2026-08-21T18:00:00Z"));
    expect(streak).toBe(0);
  });

  it("still counts today's partial progress from yesterday, if today has no comparison yet", () => {
    const rows = [view("s1", "a", "2026-08-20"), view("s1", "b", "2026-08-20")];
    const streak = computeStreak(rows, new Date("2026-08-21T09:00:00Z"));
    expect(streak).toBe(1);
  });

  it("breaks the streak across a gap day", () => {
    const rows = [
      view("s1", "a", "2026-08-18"),
      view("s1", "b", "2026-08-18"),
      view("s2", "a", "2026-08-21"),
      view("s2", "b", "2026-08-21"),
    ];
    const streak = computeStreak(rows, new Date("2026-08-21T18:00:00Z"));
    expect(streak).toBe(1);
  });

  it("returns 0 for no view history", () => {
    expect(computeStreak([], new Date("2026-08-21T18:00:00Z"))).toBe(0);
  });

  it("counts two outlets on different stories on the same day as two separate non-comparison events, not one", () => {
    const rows = [view("s1", "a", "2026-08-21"), view("s2", "b", "2026-08-21")];
    const streak = computeStreak(rows, new Date("2026-08-21T18:00:00Z"));
    expect(streak).toBe(0);
  });
});

describe("computeSidesSeenTotal", () => {
  it("counts distinct (story, outlet) pairs, ignoring duplicate views", () => {
    const rows = [
      view("s1", "a", "2026-08-19"),
      view("s1", "a", "2026-08-20"), // same story+outlet, different day — not a new side
      view("s1", "b", "2026-08-19"),
      view("s2", "a", "2026-08-19"),
    ];
    expect(computeSidesSeenTotal(rows)).toBe(3);
  });

  it("returns 0 for no view history", () => {
    expect(computeSidesSeenTotal([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- streak`
Expected: FAIL — `Cannot find module './streak'`.

- [ ] **Step 3: Implement**

Create `lib/streak.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- streak`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/streak.ts lib/streak.test.ts
git commit -m "feat: add pure sides-seen streak computation"
```

---

## Task 6: Record article views and persist streak to the profile

**Files:**
- Modify: `lib/queries.ts`
- Modify: `lib/queries.test.ts`
- Modify: `app/story/[id].tsx`

**Interfaces:**
- Consumes: `computeStreak`, `computeSidesSeenTotal`, `ViewRow` (Task 5); `getUserId` (Task 4).
- Produces: `Profile` type, `fetchProfile(supabase, userId): Promise<Profile | null>`, `recordArticleView(supabase, userId, storyId, outletId): Promise<void>`, `recomputeAndSaveStreak(supabase, userId): Promise<{streakCount, sidesSeenTotal}>` — consumed by Task 7 (Feed streak display) and Task 9 (notification content).

- [ ] **Step 1: Write the failing tests**

Add to `lib/queries.test.ts`, after the `describe("fetchConflictFlags", ...)` block:

```typescript
describe("recordArticleView", () => {
  function makeMockSupabase(result: { error: any }) {
    const upsert = jest.fn().mockResolvedValue(result);
    const from = jest.fn().mockReturnValue({ upsert });
    return { client: { from } as any, upsert, from };
  }

  it("upserts a view row, ignoring duplicates", async () => {
    const { client, upsert, from } = makeMockSupabase({ error: null });
    await recordArticleView(client, "user-1", "story-1", "outlet-1");
    expect(from).toHaveBeenCalledWith("user_story_views");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", story_id: "story-1", outlet_id: "outlet-1" },
      { onConflict: "user_id,story_id,outlet_id", ignoreDuplicates: true }
    );
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ error: { message: "boom" } });
    await expect(recordArticleView(client, "user-1", "story-1", "outlet-1")).rejects.toThrow(
      "Failed to record article view: boom"
    );
  });
});

describe("fetchProfile", () => {
  function makeMockSupabase(result: { data: any; error: any }) {
    const maybeSingle = jest.fn().mockResolvedValue(result);
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from, eq };
  }

  it("returns the profile row", async () => {
    const profile = {
      id: "user-1",
      streak_count: 3,
      longest_streak: 5,
      sides_seen_total: 12,
      notification_opt_in: true,
      notification_hour: 9,
    };
    const { client, from, eq } = makeMockSupabase({ data: profile, error: null });
    const result = await fetchProfile(client, "user-1");
    expect(from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "user-1");
    expect(result).toEqual(profile);
  });

  it("returns null when no profile row exists yet", async () => {
    const { client } = makeMockSupabase({ data: null, error: null });
    expect(await fetchProfile(client, "user-1")).toBeNull();
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchProfile(client, "user-1")).rejects.toThrow(
      "Failed to fetch profile: boom"
    );
  });
});

describe("recomputeAndSaveStreak", () => {
  interface Call {
    method: string;
    args: any[];
  }
  interface Query {
    table: string;
    calls: Call[];
  }
  const CHAIN_METHODS = ["select", "update", "eq", "gte", "maybeSingle"];

  function makeMockSupabase(resolve: (q: Query) => { data: any; error: any }) {
    const queries: Query[] = [];
    const from = jest.fn((table: string) => {
      const query: Query = { table, calls: [] };
      queries.push(query);
      const builder: any = {};
      for (const method of CHAIN_METHODS) {
        builder[method] = (...args: any[]) => {
          query.calls.push({ method, args });
          return builder;
        };
      }
      builder.then = (onFulfilled: any) => Promise.resolve(resolve(query)).then(onFulfilled);
      return builder;
    });
    return { client: { from } as any, queries };
  }

  it("recomputes streak/sides-seen from view history and saves them, raising longest_streak if beaten", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "user_story_views" && q.calls.some((c) => c.method === "gte")) {
        return {
          data: [
            { story_id: "s1", outlet_id: "a", viewed_at: "2026-08-21T10:00:00Z" },
            { story_id: "s1", outlet_id: "b", viewed_at: "2026-08-21T10:00:00Z" },
          ],
          error: null,
        };
      }
      if (q.table === "profiles" && q.calls.some((c) => c.method === "maybeSingle")) {
        return {
          data: {
            id: "user-1",
            streak_count: 0,
            longest_streak: 2,
            sides_seen_total: 0,
            notification_opt_in: false,
            notification_hour: 9,
          },
          error: null,
        };
      }
      if (q.table === "profiles" && q.calls.some((c) => c.method === "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const computeFn = jest.fn().mockReturnValue(1);
    const result = await recomputeAndSaveStreak(client, "user-1", computeFn);

    expect(result).toEqual({ streakCount: 1, sidesSeenTotal: 1 });
    const updateQuery = queries.find(
      (q) => q.table === "profiles" && q.calls.some((c) => c.method === "update")
    )!;
    const updateCall = updateQuery.calls.find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({ streak_count: 1, longest_streak: 2, sides_seen_total: 1 });
  });

  it("throws when fetching view history fails", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "user_story_views") return { data: null, error: { message: "boom" } };
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    await expect(recomputeAndSaveStreak(client, "user-1")).rejects.toThrow(
      "Failed to fetch view history: boom"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- queries`
Expected: FAIL — `recordArticleView`, `fetchProfile`, `recomputeAndSaveStreak` are not exported.

- [ ] **Step 3: Implement**

Add to `lib/queries.ts`. First, add the import at the top:

```typescript
import { computeStreak, computeSidesSeenTotal, ViewRow } from "./streak";
```

Then add, after `fetchConflictFlags`:

```typescript
export interface Profile {
  id: string;
  streak_count: number;
  longest_streak: number;
  sides_seen_total: number;
  notification_opt_in: boolean;
  notification_hour: number;
}

export async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, streak_count, longest_streak, sides_seen_total, notification_opt_in, notification_hour")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch profile: ${error.message}`);
  return data;
}

export async function recordArticleView(
  supabase: SupabaseClient,
  userId: string,
  storyId: string,
  outletId: string
): Promise<void> {
  const { error } = await supabase
    .from("user_story_views")
    .upsert(
      { user_id: userId, story_id: storyId, outlet_id: outletId },
      { onConflict: "user_id,story_id,outlet_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(`Failed to record article view: ${error.message}`);
}

// A per-user window, not the global-table pagination Task 1 deals with — a
// single reader's view history over 60 days stays small (dozens to low
// hundreds of rows), so no ceiling/pagination is needed here.
const VIEW_HISTORY_WINDOW_DAYS = 60;

export async function recomputeAndSaveStreak(
  supabase: SupabaseClient,
  userId: string,
  computeStreakFn: (rows: ViewRow[], now: Date) => number = computeStreak
): Promise<{ streakCount: number; sidesSeenTotal: number }> {
  const cutoff = new Date(
    Date.now() - VIEW_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data, error } = await supabase
    .from("user_story_views")
    .select("story_id, outlet_id, viewed_at")
    .eq("user_id", userId)
    .gte("viewed_at", cutoff);
  if (error) throw new Error(`Failed to fetch view history: ${error.message}`);
  const rows = (data ?? []) as ViewRow[];

  const streakCount = computeStreakFn(rows, new Date());
  const sidesSeenTotal = computeSidesSeenTotal(rows);

  const profile = await fetchProfile(supabase, userId);
  const longestStreak = Math.max(profile?.longest_streak ?? 0, streakCount);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ streak_count: streakCount, longest_streak: longestStreak, sides_seen_total: sidesSeenTotal })
    .eq("id", userId);
  if (updateError) throw new Error(`Failed to save streak: ${updateError.message}`);

  return { streakCount, sidesSeenTotal };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- queries`
Expected: PASS.

- [ ] **Step 5: Wire view recording into the Story screen**

In `app/story/[id].tsx`, update the imports:

```typescript
import { supabase } from "../../lib/supabase";
import { getUserId } from "../../lib/auth";
import {
  fetchStoryWithArticles,
  fetchConflictFlags,
  fetchSilentOutlets,
  recordArticleView,
  recomputeAndSaveStreak,
} from "../../lib/queries";
```

Inside the component, add state for the user id, resolved once on mount:

```typescript
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    getUserId(supabase)
      .then(setUserId)
      .catch((err) => console.error("Failed to resolve user id:", err));
  }, []);
```

Replace the article `Pressable`'s `onPress`:

```typescript
            onPress={() => Linking.openURL(article.url)}
```

with:

```typescript
            onPress={() => {
              Linking.openURL(article.url);
              // Fire-and-forget: recording the view/streak must never block
              // or interrupt actually opening the article, and a transient
              // failure here shouldn't surface as an error to the reader.
              if (userId && outlet) {
                recordArticleView(supabase, userId, story!.id, outlet.id)
                  .then(() => recomputeAndSaveStreak(supabase, userId))
                  .catch((err) => console.error("Failed to record view/streak:", err));
              }
            }}
```

- [ ] **Step 6: Run the full test suite and verify manually**

Run: `npm test`
Expected: PASS, no failures.

Run: `npx expo start`, press `w`. Open a story, tap two different outlets' articles. In the Supabase Table Editor, confirm `user_story_views` has two new rows and `profiles.sides_seen_total` incremented for the anonymous user's row.

- [ ] **Step 7: Commit**

```bash
git add lib/queries.ts lib/queries.test.ts app/story/[id].tsx
git commit -m "feat: record article views and persist sides-seen streak"
```

---

## Task 7: Streak display on the Feed screen

**Files:**
- Modify: `app/index.tsx`

**Interfaces:**
- Consumes: `getUserId` (Task 4), `fetchProfile`, `Profile` (Task 6).

- [ ] **Step 1: Add streak state and fetch it on mount**

In `app/index.tsx`, update imports:

```typescript
import { useEffect, useState } from "react";
import { FlatList, Text, Pressable, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import { fetchRecentStories, fetchProfile, Profile } from "../lib/queries";
import { Story } from "../lib/types";
```

Add state and a fetch effect inside `FeedScreen`, alongside the existing `stories` state:

```typescript
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    getUserId(supabase)
      .then((userId) => fetchProfile(supabase, userId))
      .then(setProfile)
      // Streak display is a nice-to-have on top of the core feed — a
      // failure here must never block or error the feed itself.
      .catch((err) => console.error("Failed to load profile:", err));
  }, []);
```

- [ ] **Step 2: Render the streak in the list header**

Replace the `ListHeaderComponent`:

```tsx
      ListHeaderComponent={
        <Pressable onPress={() => router.push("/methodology")} style={{ padding: 16 }}>
          <Text style={{ color: "#0066cc" }}>How are these badges calculated? Methodology →</Text>
        </Pressable>
      }
```

with:

```tsx
      ListHeaderComponent={
        <View>
          {profile && profile.streak_count > 0 ? (
            <Text style={{ padding: 16, paddingBottom: 0, fontWeight: "600" }}>
              {profile.streak_count}-day streak · {profile.sides_seen_total} sides seen
            </Text>
          ) : null}
          <Pressable onPress={() => router.push("/methodology")} style={{ padding: 16 }}>
            <Text style={{ color: "#0066cc" }}>How are these badges calculated? Methodology →</Text>
          </Pressable>
        </View>
      }
```

- [ ] **Step 3: Manual verification**

Run: `npx expo start`, press `w`. After the view-recording done in Task 6's verification, reload the Feed screen. Expected: "N-day streak · M sides seen" appears above the Methodology link.

- [ ] **Step 4: Commit**

```bash
git add app/index.tsx
git commit -m "feat: display sides-seen streak on the Feed screen"
```

---

## Task 8: Ethical-copy module and local notification scheduling (pure, tested)

**Files:**
- Create: `lib/notificationCopy.ts`
- Create: `lib/notificationCopy.test.ts`
- Create: `lib/notifications.ts`
- Create: `lib/notifications.test.ts`
- Modify: `package.json`, `app.json`

**Interfaces:**
- Produces: `assertEthicalCopy(text: string): void`, `DailyDigestStats`, `buildDailyDigestCopy(stats): {title, body}` (`notificationCopy.ts`); `nextTriggerDate(now, hour): Date`, `ensureAndroidChannel()`, `requestNotificationPermission(): Promise<boolean>`, `scheduleDailyDigest(content, hour, now?): Promise<void>` (`notifications.ts`) — consumed by Task 9.

- [ ] **Step 1: Install expo-notifications**

```bash
npx expo install expo-notifications
```

Add `"expo-notifications"` to the `plugins` array in `app.json`:

```json
    "plugins": [
      "expo-router",
      "expo-status-bar",
      "expo-notifications"
    ]
```

- [ ] **Step 2: Write the failing tests for the ethical-copy module**

Create `lib/notificationCopy.test.ts`:

```typescript
import { assertEthicalCopy, buildDailyDigestCopy } from "./notificationCopy";

describe("assertEthicalCopy", () => {
  it("does not throw for neutral, informational copy", () => {
    expect(() =>
      assertEthicalCopy("Today's top story has 9 sources, and 2 outlets are silent on it.")
    ).not.toThrow();
  });

  it.each([
    "Don't lose your streak!",
    "You'll lose your progress if you don't open the app today.",
    "See what they're hiding.",
    "Last chance to keep your streak alive.",
    "Warning: your streak is at risk.",
    "Don't miss out on today's top story.",
  ])("throws for loss-framed or fear-framed copy: %s", (badCopy) => {
    expect(() => assertEthicalCopy(badCopy)).toThrow(/ethical nudge charter/i);
  });
});

describe("buildDailyDigestCopy", () => {
  it("produces promotion-framed copy naming the source and silence counts", () => {
    const { title, body } = buildDailyDigestCopy({
      topStoryHeadline: "Farm bill repealed",
      sourceCount: 9,
      silentCount: 2,
    });
    expect(title).toBeTruthy();
    expect(body).toContain("Farm bill repealed");
    expect(body).toContain("9");
    expect(body).toContain("2");
  });

  it("omits the silence clause entirely when no outlet is silent", () => {
    const { body } = buildDailyDigestCopy({
      topStoryHeadline: "Farm bill repealed",
      sourceCount: 9,
      silentCount: 0,
    });
    expect(body).not.toMatch(/silent|haven'?t/i);
  });

  it("passes its own output through the ethical-copy guard without throwing", () => {
    expect(() =>
      buildDailyDigestCopy({ topStoryHeadline: "Any story", sourceCount: 3, silentCount: 1 })
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- notificationCopy`
Expected: FAIL — `Cannot find module './notificationCopy'`.

- [ ] **Step 4: Implement**

Create `lib/notificationCopy.ts`:

```typescript
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

export function buildDailyDigestCopy(stats: DailyDigestStats): { title: string; body: string } {
  const title = "Today's story, from every side";
  const body =
    stats.silentCount > 0
      ? `"${stats.topStoryHeadline}" has ${stats.sourceCount} sources covering it, and ${stats.silentCount} outlets haven't weighed in yet.`
      : `"${stats.topStoryHeadline}" has ${stats.sourceCount} sources covering it. See how they compare.`;

  assertEthicalCopy(title);
  assertEthicalCopy(body);
  return { title, body };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- notificationCopy`
Expected: PASS (9 tests).

- [ ] **Step 6: Write the failing tests for the notification scheduling wrapper**

Create `lib/notifications.test.ts`:

```typescript
import { nextTriggerDate } from "./notifications";

describe("nextTriggerDate", () => {
  it("schedules for later today when the hour hasn't passed yet", () => {
    const now = new Date("2026-08-21T07:00:00Z");
    const result = nextTriggerDate(now, 9);
    expect(result.toISOString().slice(0, 16)).toBe("2026-08-21T09:00");
  });

  it("schedules for tomorrow when the hour has already passed today", () => {
    const now = new Date("2026-08-21T10:00:00Z");
    const result = nextTriggerDate(now, 9);
    expect(result.toISOString().slice(0, 16)).toBe("2026-08-22T09:00");
  });

  it("schedules for tomorrow when it is exactly the trigger hour", () => {
    const now = new Date("2026-08-21T09:00:00Z");
    const result = nextTriggerDate(now, 9);
    expect(result.toISOString().slice(0, 16)).toBe("2026-08-22T09:00");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- notifications`
Expected: FAIL — `Cannot find module './notifications'`.

- [ ] **Step 8: Implement**

Create `lib/notifications.ts`:

```typescript
import * as Notifications from "expo-notifications";

// Pure and local-time-based, so it's testable without a device. Note: this
// uses the JS Date object's local-timezone getters/setters deliberately —
// "9am" should mean 9am on the reader's device, not 9am UTC.
export function nextTriggerDate(now: Date, hour: number): Date {
  const trigger = new Date(now.getTime());
  trigger.setHours(hour, 0, 0, 0);
  if (trigger.getTime() <= now.getTime()) {
    trigger.setDate(trigger.getDate() + 1);
  }
  return trigger;
}

export async function ensureAndroidChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync("daily-digest", {
    name: "Daily digest",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// Local, on-device notification — deliberately not a server-pushed one.
// Expo Go on Android has not supported remote push since SDK 53, this
// project's only distribution channel is a sideloaded APK (no push-token
// backend exists or is planned), and a one-shot local notification
// rescheduled with fresh content on every app open (see Task 9) delivers
// the spec's "different content per day" requirement without any of that
// infrastructure.
export async function scheduleDailyDigest(
  content: { title: string; body: string },
  hour: number,
  now: Date = new Date()
): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: content.title, body: content.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextTriggerDate(now, hour),
    },
  });
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -- notifications`
Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add lib/notificationCopy.ts lib/notificationCopy.test.ts lib/notifications.ts lib/notifications.test.ts package.json package-lock.json app.json
git commit -m "feat: add ethical-copy guard and local daily-digest scheduling"
```

---

## Task 9: Notification opt-in prompt and daily rescheduling

**Files:**
- Modify: `app/index.tsx`

**Interfaces:**
- Consumes: `requestNotificationPermission`, `ensureAndroidChannel`, `scheduleDailyDigest` (Task 8); `buildDailyDigestCopy` (Task 8); `fetchProfile`, `Profile` (Task 6); `fetchSilentOutlets`-style story stats — this task computes stats from data the Feed screen already loads (top story + a coverage count), not a new fetch.
- Consumes: `@react-native-async-storage/async-storage` (already installed in Task 4) for the local "dismissed" flag.

**Design:** Per spec §7.1 ("notification frequency is user-controlled from day one, not opt-out-buried") and §7.3 ("no dark patterns... easy unsubscribe"), the prompt appears only **after the reader has already earned a 1-day streak** (not at install — install-time permission prompts are exactly the pattern the spec's autonomy principle rejects), and a single dismissal suppresses it permanently (stored locally, not nagged again).

- [ ] **Step 1: Install the AsyncStorage dependency reference (already present from Task 4) and add opt-in state**

`@react-native-async-storage/async-storage` was already installed in Task 4 — no new install needed here.

In `app/index.tsx`, update imports:

```typescript
import { useEffect, useState } from "react";
import { FlatList, Text, Pressable, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import { fetchRecentStories, fetchProfile, Profile } from "../lib/queries";
import { Story } from "../lib/types";
import {
  requestNotificationPermission,
  ensureAndroidChannel,
  scheduleDailyDigest,
} from "../lib/notifications";
import { buildDailyDigestCopy } from "../lib/notificationCopy";

const NOTIFICATION_PROMPT_DISMISSED_KEY = "notificationPromptDismissed";
```

- [ ] **Step 2: Add prompt-visibility state and the reschedule-on-open effect**

Inside `FeedScreen`, alongside the existing `profile` state, add:

```typescript
  const [userId, setUserId] = useState<string | null>(null);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  useEffect(() => {
    getUserId(supabase)
      .then(async (id) => {
        setUserId(id);
        const p = await fetchProfile(supabase, id);
        setProfile(p);

        if (p?.notification_opt_in) {
          // Already opted in: keep the notification's content fresh every
          // time the app is opened, since there is no server push to do
          // this in the background.
          rescheduleDigest(p.notification_hour);
        } else if (p && p.streak_count >= 1) {
          const dismissed = await AsyncStorage.getItem(NOTIFICATION_PROMPT_DISMISSED_KEY);
          if (!dismissed) setShowNotificationPrompt(true);
        }
      })
      .catch((err) => console.error("Failed to load profile:", err));
  }, []);

  async function rescheduleDigest(hour: number) {
    try {
      const recent = await fetchRecentStories(supabase);
      if (recent.length === 0) return;
      const top = recent[0];
      const content = buildDailyDigestCopy({
        topStoryHeadline: top.canonical_headline ?? "Today's top story",
        // Feed-level stats only — not a per-story source/silence fetch,
        // to keep this cheap on every app open. "1" is a conservative
        // floor since the story is on the feed at all (≥1 source exists).
        sourceCount: 1,
        silentCount: 0,
      });
      await scheduleDailyDigest(content, hour);
    } catch (err) {
      console.error("Failed to reschedule daily digest:", err);
    }
  }

  async function handleEnableNotifications() {
    setShowNotificationPrompt(false);
    const granted = await requestNotificationPermission();
    if (!granted || !userId) return;
    await ensureAndroidChannel();
    const { error } = await supabase
      .from("profiles")
      .update({ notification_opt_in: true })
      .eq("id", userId);
    if (error) {
      console.error("Failed to save notification opt-in:", error.message);
      return;
    }
    setProfile((prev) => (prev ? { ...prev, notification_opt_in: true } : prev));
    rescheduleDigest(9);
  }

  async function handleDismissNotificationPrompt() {
    setShowNotificationPrompt(false);
    await AsyncStorage.setItem(NOTIFICATION_PROMPT_DISMISSED_KEY, "true");
  }
```

- [ ] **Step 3: Render the prompt**

In the `ListHeaderComponent`, add the prompt block above the streak text:

```tsx
      ListHeaderComponent={
        <View>
          {showNotificationPrompt ? (
            <View style={{ padding: 16, backgroundColor: "#f5f5f5" }}>
              <Text>
                Get a daily digest of today's top story and who's silent on it.
              </Text>
              <View style={{ flexDirection: "row", marginTop: 8, gap: 16 }}>
                <Pressable onPress={handleEnableNotifications}>
                  <Text style={{ color: "#0066cc", fontWeight: "600" }}>Turn on</Text>
                </Pressable>
                <Pressable onPress={handleDismissNotificationPrompt}>
                  <Text style={{ color: "#777" }}>No thanks</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {profile && profile.streak_count > 0 ? (
            <Text style={{ padding: 16, paddingBottom: 0, fontWeight: "600" }}>
              {profile.streak_count}-day streak · {profile.sides_seen_total} sides seen
            </Text>
          ) : null}
          <Pressable onPress={() => router.push("/methodology")} style={{ padding: 16 }}>
            <Text style={{ color: "#0066cc" }}>How are these badges calculated? Methodology →</Text>
          </Pressable>
        </View>
      }
```

- [ ] **Step 4: Manual verification**

Run: `npx expo start`, press `w` for a first pass (permission UI is native-only, so full verification needs a device/emulator — Expo Go on Android or iOS Simulator). On a device with Expo Go: build a 1-day streak (Task 6/7's verification already did this), reload the Feed, confirm the opt-in banner appears; tap "Turn on," grant the OS permission prompt, and confirm `profiles.notification_opt_in` becomes `true` in Supabase. Note for the record: remote push isn't being used here, so this local scheduling path works identically in Expo Go and in the final APK — no APK-only step to defer.

- [ ] **Step 5: Commit**

```bash
git add app/index.tsx
git commit -m "feat: add notification opt-in prompt and reschedule digest on app open"
```

---

## Task 10: Anonymous-to-account upgrade flow

**Files:**
- Create: `app/upgrade.tsx`
- Modify: `app/_layout.tsx`
- Modify: `app/index.tsx`

**Interfaces:**
- Consumes: `getUserId` (Task 4), `Profile`, `fetchProfile` (Task 6).

**Design:** Per spec §6, the upgrade offer appears **after a streak milestone, not at install**, and is optional/dismissible. Scope note: this task builds **email linking only**. Google OAuth in a plain Expo-Go-compatible managed app needs `expo-auth-session` plus a configured OAuth redirect scheme — a real feature, not a config tweak — and is cut here for the same reason WhatsApp share cards stayed text-only (Task 11): staying inside the zero-custom-native-dependency workflow this project has used since Week 1, given the course deadline. Documented here, not silently dropped, matching this plan's Global Constraints.

- [ ] **Step 1: Register the new route**

In `app/_layout.tsx`, add a screen entry:

```tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Today's Stories" }} />
      <Stack.Screen name="story/[id]" options={{ title: "Story" }} />
      <Stack.Screen name="methodology" options={{ title: "Methodology" }} />
      <Stack.Screen name="upgrade" options={{ title: "Save your progress" }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Build the upgrade screen**

Create `app/upgrade.tsx`:

```tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export default function UpgradeScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit() {
    if (!email.trim()) return;
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
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Check your email</Text>
        <Text style={{ marginTop: 8, color: "#555" }}>
          Tap the confirmation link we sent to {email.trim()}, then reopen Sourced. Your streak
          and reading history carry over exactly as they are.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: "600" }}>Save your progress</Text>
      <Text style={{ marginTop: 8, color: "#555" }}>
        Add an email so your streak and reading history aren't lost if you reinstall. Nothing
        else changes — no password needed right now.
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ marginTop: 16, borderWidth: 1, borderColor: "#ccc", borderRadius: 4, padding: 12 }}
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

- [ ] **Step 3: Offer the upgrade after a streak milestone**

In `app/index.tsx`, add the milestone constant near the top of the file:

```typescript
const UPGRADE_PROMPT_STREAK_MILESTONE = 3;
const UPGRADE_PROMPT_DISMISSED_KEY = "upgradePromptDismissed";
```

Add upgrade-prompt state alongside `showNotificationPrompt`:

```typescript
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
```

In the profile-loading effect from Task 9, after the notification-prompt branch, add:

```typescript
        if (p && p.streak_count >= UPGRADE_PROMPT_STREAK_MILESTONE) {
          const dismissed = await AsyncStorage.getItem(UPGRADE_PROMPT_DISMISSED_KEY);
          if (!dismissed) setShowUpgradePrompt(true);
        }
```

(this sits inside the same `.then(async (id) => { ... })` block as the notification-prompt check — add it as a sibling `if`, not nested inside the notification branch, so both prompts are evaluated independently).

Add a dismiss handler next to `handleDismissNotificationPrompt`:

```typescript
  async function handleDismissUpgradePrompt() {
    setShowUpgradePrompt(false);
    await AsyncStorage.setItem(UPGRADE_PROMPT_DISMISSED_KEY, "true");
  }
```

In the `ListHeaderComponent`, add the upgrade banner above the notification-prompt block:

```tsx
          {showUpgradePrompt ? (
            <View style={{ padding: 16, backgroundColor: "#f5f5f5" }}>
              <Text>
                Nice, a {profile?.streak_count}-day streak! Save your progress so it's not lost if
                you reinstall.
              </Text>
              <View style={{ flexDirection: "row", marginTop: 8, gap: 16 }}>
                <Pressable onPress={() => router.push("/upgrade")}>
                  <Text style={{ color: "#0066cc", fontWeight: "600" }}>Add email</Text>
                </Pressable>
                <Pressable onPress={handleDismissUpgradePrompt}>
                  <Text style={{ color: "#777" }}>Maybe later</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
```

- [ ] **Step 4: Manual verification**

This needs a 3-day streak to trigger naturally, which is impractical to wait for during development — verify by temporarily setting a test profile's `streak_count` to `3` directly in the Supabase Table Editor, reloading the Feed screen, and confirming the "Add email" banner appears; tapping it navigates to `/upgrade`; submitting an email shows the "Check your email" confirmation state. Revert the manual `streak_count` edit afterward so it doesn't mask Task 6/7's real computed value.

- [ ] **Step 5: Commit**

```bash
git add app/upgrade.tsx app/_layout.tsx app/index.tsx
git commit -m "feat: add anonymous-to-account email upgrade flow"
```

---

## Task 11: WhatsApp share cards

**Files:**
- Create: `lib/shareCopy.ts`
- Create: `lib/shareCopy.test.ts`
- Modify: `app/story/[id].tsx`

**Interfaces:**
- Produces: `buildShareText(story: {headline: string}, sourceCount: number, silentCount: number): string` — consumed by the Story screen's Share button.
- Consumes: `assertEthicalCopy` (Task 8).

- [ ] **Step 1: Write the failing tests**

Create `lib/shareCopy.test.ts`:

```typescript
import { buildShareText } from "./shareCopy";

describe("buildShareText", () => {
  it("includes the headline and source count", () => {
    const text = buildShareText({ headline: "Farm bill repealed" }, 9, 2);
    expect(text).toContain("Farm bill repealed");
    expect(text).toContain("9");
  });

  it("mentions the silence count when outlets are silent", () => {
    const text = buildShareText({ headline: "Farm bill repealed" }, 9, 2);
    expect(text).toMatch(/2 outlets/i);
  });

  it("omits any silence mention when nothing is silent", () => {
    const text = buildShareText({ headline: "Farm bill repealed" }, 9, 0);
    expect(text).not.toMatch(/silent|haven'?t/i);
  });

  it("mentions the app name so the forward is identifiable", () => {
    const text = buildShareText({ headline: "Farm bill repealed" }, 9, 0);
    expect(text).toMatch(/sourced/i);
  });

  it("never throws the ethical-copy guard for its own output", () => {
    expect(() => buildShareText({ headline: "Any story" }, 3, 1)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shareCopy`
Expected: FAIL — `Cannot find module './shareCopy'`.

- [ ] **Step 3: Implement**

Create `lib/shareCopy.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- shareCopy`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the Share button to the Story screen**

In `app/story/[id].tsx`, update the import from `react-native` to include `Share`:

```typescript
import { ScrollView, Text, ActivityIndicator, Linking, Pressable, View, Share } from "react-native";
```

Add the import:

```typescript
import { buildShareText } from "../../lib/shareCopy";
```

Just after the `story.summary` block (before the framing-comparison section added in Task 2), add:

```tsx
      <Pressable
        onPress={() => {
          const silentCount = silentOutlets.length;
          Share.share({
            message: buildShareText(
              { headline: story.canonical_headline ?? "This story" },
              articles.length,
              silentCount
            ),
          }).catch((err) => console.error("Share failed:", err));
        }}
        style={{ marginTop: 12 }}
      >
        <Text style={{ color: "#0066cc", fontWeight: "600" }}>Share this story →</Text>
      </Pressable>
```

- [ ] **Step 6: Manual verification**

Run: `npx expo start`, open on a device (the native share sheet doesn't render on `w`/web — use Expo Go on Android/iOS). Open a story, tap "Share this story →". Expected: the native share sheet opens with WhatsApp (if installed) as one of the targets, prefilled with the headline, source count, and silence count, in the same informational tone as the notification copy.

- [ ] **Step 7: Commit**

```bash
git add lib/shareCopy.ts lib/shareCopy.test.ts app/story/[id].tsx
git commit -m "feat: add WhatsApp-ready text share cards"
```

---

## Task 12 (STRETCH — build only if Tasks 1-11 are done with time remaining): Fact-checker cross-referencing

**Files:**
- Create: `supabase/migrations/0004_fact_checks.sql`
- Create: `supabase/seed/factCheckSources.json`
- Create: `scripts/factcheck/classifyVerdict.ts`
- Create: `scripts/factcheck/classifyVerdict.test.ts`
- Create: `scripts/factcheck/matchFactChecks.ts`
- Create: `scripts/factcheck/matchFactChecks.test.ts`
- Create: `scripts/factcheck/run.ts`
- Create: `.github/workflows/factcheck.yml`
- Modify: `lib/queries.ts`
- Modify: `lib/queries.test.ts`
- Modify: `app/story/[id].tsx`

**Interfaces:**
- Consumes: `fetchFeed`, `dedupeByUrl` (`scripts/ingest/fetchFeeds.ts`, unchanged); `embedText` (`scripts/cluster/embed.ts`, unchanged); `cosineSimilarity` (`scripts/cluster/similarity.ts`, unchanged).
- Produces: `fact_checks` table; `classifyVerdict(title: string): string`; `matchFactChecksToStories(supabase, embedFn): Promise<number>`; `fetchFactChecks(supabase, storyId): Promise<FactCheck[]>` — consumed by the Story screen.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_fact_checks.sql`:

```sql
create table fact_checks (
  id uuid primary key default gen_random_uuid(),
  source_org text not null,
  claim text not null,
  verdict text not null,
  url text not null unique,
  published_at timestamptz,
  matched_story_id uuid references stories(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table fact_checks enable row level security;

create policy "public read fact_checks" on fact_checks for select using (true);
```

Apply it in the Supabase SQL Editor as in prior migrations. Confirm `fact_checks` appears in Table Editor.

- [ ] **Step 2: Seed fact-check sources**

Create `supabase/seed/factCheckSources.json`:

```json
[
  { "name": "Alt News", "rss_url": "https://www.altnews.in/feed/" },
  { "name": "BOOM", "rss_url": "https://www.boomlive.in/feed" },
  { "name": "Factly", "rss_url": "https://factly.in/feed/" }
]
```

Verify each URL resolves: `curl -sI "<rss_url>" | head -n 1` should show `200`. If any has gone stale, find the outlet's current fact-check RSS feed and replace it here before proceeding, same as every prior outlet-list task.

- [ ] **Step 3: Write the failing tests for verdict classification**

Create `scripts/factcheck/classifyVerdict.test.ts`:

```typescript
import { classifyVerdict } from "./classifyVerdict";

describe("classifyVerdict", () => {
  it("classifies debunking language as False", () => {
    expect(classifyVerdict("Fact Check: Viral claim about vaccine is FALSE")).toBe("False");
    expect(classifyVerdict("This morphed image is fake, here's the truth")).toBe("False");
  });

  it("classifies misleading language as Misleading", () => {
    expect(classifyVerdict("Old video shared with misleading context")).toBe("Misleading");
  });

  it("classifies confirming language as True", () => {
    expect(classifyVerdict("Yes, this viral claim is true and confirmed")).toBe("True");
  });

  it("falls back to Unverified for ambiguous titles", () => {
    expect(classifyVerdict("A look at this week's viral claims")).toBe("Unverified");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- classifyVerdict`
Expected: FAIL — `Cannot find module './classifyVerdict'`.

- [ ] **Step 5: Implement**

Create `scripts/factcheck/classifyVerdict.ts`:

```typescript
// A cheap keyword heuristic, deliberately not an LLM call — this project's
// Gemini generateContent quota (~20/day) is already fully committed to
// headline batching (Task 2, Week 2), and fact-check RSS titles reliably
// state their own verdict in plain language ("FALSE", "misleading", etc.).
export function classifyVerdict(title: string): "False" | "Misleading" | "True" | "Unverified" {
  const lower = title.toLowerCase();
  if (/\b(false|fake|debunk|hoax|morphed|doctored)\b/.test(lower)) return "False";
  if (/\bmisleading\b/.test(lower)) return "Misleading";
  if (/\b(true|confirmed|correct|verified)\b/.test(lower)) return "True";
  return "Unverified";
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- classifyVerdict`
Expected: PASS (4 tests).

- [ ] **Step 7: Write the failing tests for story matching**

Create `scripts/factcheck/matchFactChecks.test.ts`:

```typescript
import { matchFactChecksToStories } from "./matchFactChecks";

interface Call {
  method: string;
  args: any[];
}
interface Query {
  table: string;
  calls: Call[];
}
const CHAIN_METHODS = ["select", "update", "is", "gte", "not", "eq", "order", "limit"];

function makeMockSupabase(resolve: (q: Query) => { data: any; error: any }) {
  const queries: Query[] = [];
  const from = jest.fn((table: string) => {
    const query: Query = { table, calls: [] };
    queries.push(query);
    const builder: any = {};
    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: any[]) => {
        query.calls.push({ method, args });
        return builder;
      };
    }
    builder.then = (onFulfilled: any) => Promise.resolve(resolve(query)).then(onFulfilled);
    return builder;
  });
  return { client: { from } as any, queries };
}

describe("matchFactChecksToStories", () => {
  it("matches an unmatched fact-check to the most similar recent story above the threshold", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "fact_checks" && q.calls.some((c) => c.method === "is")) {
        return { data: [{ id: "fc-1", claim: "Claim text" }], error: null };
      }
      if (q.table === "stories") {
        return {
          data: [
            { id: "story-1", canonical_headline: "H1", summary: "S1" },
            { id: "story-2", canonical_headline: "H2", summary: "S2" },
          ],
          error: null,
        };
      }
      if (q.table === "fact_checks" && q.calls.some((c) => c.method === "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const embedFn = jest
      .fn()
      .mockResolvedValueOnce([1, 0]) // fact-check claim embedding
      .mockResolvedValueOnce([1, 0]) // story-1 embedding — identical, similarity 1
      .mockResolvedValueOnce([0, 1]); // story-2 embedding — orthogonal, similarity 0

    const matched = await matchFactChecksToStories(client, embedFn, 0.8);

    expect(matched).toBe(1);
    const updateQuery = queries.find(
      (q) => q.table === "fact_checks" && q.calls.some((c) => c.method === "update")
    )!;
    const updateCall = updateQuery.calls.find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({ matched_story_id: "story-1" });
  });

  it("leaves a fact-check unmatched when nothing clears the similarity threshold", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "fact_checks" && q.calls.some((c) => c.method === "is")) {
        return { data: [{ id: "fc-1", claim: "Claim text" }], error: null };
      }
      if (q.table === "stories") {
        return { data: [{ id: "story-1", canonical_headline: "H1", summary: "S1" }], error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const embedFn = jest.fn().mockResolvedValueOnce([1, 0]).mockResolvedValueOnce([0, 1]);

    const matched = await matchFactChecksToStories(client, embedFn, 0.8);

    expect(matched).toBe(0);
    expect(queries.filter((q) => q.table === "fact_checks" && q.calls.some((c) => c.method === "update"))).toHaveLength(0);
  });

  it("returns 0 without embedding anything when there are no unmatched fact-checks", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "fact_checks") return { data: [], error: null };
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    const embedFn = jest.fn();
    expect(await matchFactChecksToStories(client, embedFn, 0.8)).toBe(0);
    expect(embedFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `npm test -- matchFactChecks`
Expected: FAIL — `Cannot find module './matchFactChecks'`.

- [ ] **Step 9: Implement**

Create `scripts/factcheck/matchFactChecks.ts`:

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import { cosineSimilarity } from "../cluster/similarity";

const RECENT_STORY_WINDOW_HOURS = 72;
// A small batch, not the full backlog — each run embeds at most this many
// fact-checks, keeping this comfortably inside Gemini's separate 1,000/day
// embedding quota (learned the hard way during Week 2's backlog catch-up).
const MAX_PER_RUN = 20;

export async function matchFactChecksToStories(
  supabase: SupabaseClient,
  embedFn: (text: string) => Promise<number[]>,
  similarityThreshold: number
): Promise<number> {
  const { data: unmatched, error } = await supabase
    .from("fact_checks")
    .select("id, claim")
    .is("matched_story_id", null)
    .limit(MAX_PER_RUN);
  if (error) throw new Error(`Failed to fetch unmatched fact-checks: ${error.message}`);
  if (!unmatched || unmatched.length === 0) return 0;

  const cutoff = new Date(Date.now() - RECENT_STORY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("id, canonical_headline, summary")
    .not("canonical_headline", "is", null)
    .gte("first_seen_at", cutoff);
  if (storiesError) throw new Error(`Failed to fetch recent stories: ${storiesError.message}`);
  if (!stories || stories.length === 0) return 0;

  const storyEmbeddings: { id: string; embedding: number[] }[] = [];
  for (const story of stories) {
    const embedding = await embedFn(`${story.canonical_headline}\n${story.summary ?? ""}`);
    storyEmbeddings.push({ id: story.id, embedding });
  }

  let matched = 0;
  for (const factCheck of unmatched) {
    const claimEmbedding = await embedFn(factCheck.claim);
    let bestStoryId: string | null = null;
    let bestSimilarity = -1;
    for (const story of storyEmbeddings) {
      const similarity = cosineSimilarity(claimEmbedding, story.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestStoryId = story.id;
      }
    }
    if (bestStoryId && bestSimilarity >= similarityThreshold) {
      const { error: updateError } = await supabase
        .from("fact_checks")
        .update({ matched_story_id: bestStoryId })
        .eq("id", factCheck.id);
      if (!updateError) matched += 1;
    }
  }
  return matched;
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm test -- matchFactChecks`
Expected: PASS (3 tests).

- [ ] **Step 11: Write the ingestion + matching entrypoint**

Create `scripts/factcheck/run.ts`:

```typescript
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { fetchFeed, dedupeByUrl } from "../ingest/fetchFeeds";
import { embedText } from "../cluster/embed";
import { classifyVerdict } from "./classifyVerdict";
import { matchFactChecksToStories } from "./matchFactChecks";
import sources from "../../supabase/seed/factCheckSources.json";

const MATCH_SIMILARITY_THRESHOLD = 0.82;

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !serviceKey || !geminiKey) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY must be set");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let ingested = 0;
  for (const source of sources) {
    try {
      const items = dedupeByUrl(await fetchFeed(source.rss_url));
      const rows = items.map((item) => ({
        source_org: source.name,
        claim: item.title,
        verdict: classifyVerdict(item.title),
        url: item.url,
        published_at: item.publishedAt,
      }));
      if (rows.length === 0) continue;
      const { error, count } = await supabase
        .from("fact_checks")
        .upsert(rows, { onConflict: "url", ignoreDuplicates: true, count: "exact" });
      if (error) throw new Error(error.message);
      ingested += count ?? 0;
      console.log(`Ingested ${count ?? 0} fact-checks from ${source.name}`);
    } catch (err) {
      console.error(`Failed to ingest ${source.name}:`, err);
    }
  }
  console.log(`Done ingesting. ${ingested} new fact-checks.`);

  const matched = await matchFactChecksToStories(
    supabase,
    (text) => embedText(text, geminiKey),
    MATCH_SIMILARITY_THRESHOLD
  );
  console.log(`Matched ${matched} fact-checks to stories.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add to `package.json` `"scripts"`: `"factcheck": "tsx scripts/factcheck/run.ts"`.

- [ ] **Step 12: Run it against the real Supabase project**

Run: `npm run factcheck`
Expected: ingestion log lines per source, then `Matched N fact-checks to stories.` Check the Supabase Table Editor → `fact_checks` has rows, some with `matched_story_id` set.

- [ ] **Step 13: Schedule it**

Create `.github/workflows/factcheck.yml`:

```yaml
name: Ingest and match fact-checks

on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch: {}

jobs:
  factcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run factcheck
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

Once daily, at a different hour than the existing `ingest.yml` (2-hourly) and `score.yml` crons, to keep the shared Gemini quota from overlapping.

- [ ] **Step 14: Expose fact-checks on the Story screen**

Add to `lib/queries.ts`:

```typescript
export interface FactCheck {
  source_org: string;
  claim: string;
  verdict: string;
  url: string;
}

export async function fetchFactChecks(supabase: SupabaseClient, storyId: string): Promise<FactCheck[]> {
  const { data, error } = await supabase
    .from("fact_checks")
    .select("source_org, claim, verdict, url")
    .eq("matched_story_id", storyId);
  if (error) throw new Error(`Failed to fetch fact-checks: ${error.message}`);
  return data ?? [];
}
```

Add the corresponding test to `lib/queries.test.ts`, following the exact same three-case shape (`success`, `empty/null`, `error`) as `fetchConflictFlags`'s tests immediately above it in that file.

In `app/story/[id].tsx`, fetch and render fact-checks the same fail-soft way conflict flags and silent outlets already are: add `fetchFactChecks` to the existing `Promise.all([...])` call in the load effect, store it in a new `factChecks` state array, and render a "Fact-checked" section (source org, verdict, claim, tappable to the original fact-check URL) near the bottom of the screen, below the silence-signal block.

- [ ] **Step 15: Commit**

```bash
git add supabase/migrations/0004_fact_checks.sql supabase/seed/factCheckSources.json scripts/factcheck .github/workflows/factcheck.yml lib/queries.ts lib/queries.test.ts app/story/[id].tsx package.json package-lock.json
git commit -m "feat: add fact-checker cross-referencing (Alt News, BOOM, Factly)"
```

---

## Task 13 (STRETCH — build only if Task 12 is done with time remaining): Reader quick-polls

**Files:**
- Create: `supabase/migrations/0005_polls.sql`
- Create: `lib/polls.ts`
- Create: `lib/polls.test.ts`
- Modify: `lib/queries.ts`
- Modify: `lib/queries.test.ts`
- Modify: `app/story/[id].tsx`

**Interfaces:**
- Produces: `outlet_poll_responses` table, `outlet_poll_tallies` view; `PollResponse` type; `submitPollResponse(supabase, userId, storyId, outletId, response): Promise<void>`; `fetchPollTally(supabase, storyId, outletId): Promise<PollTally>`; `shouldShowPoll(outlet: {govt_lean_score: number | null; is_youtube: boolean}): boolean` — consumed by the Story screen.

**Design:** Per spec §3, prioritized on "independent/YouTube sources lacking institutional data" — the poll only appears for an outlet with no `govt_lean_score` yet, so it's filling a real data gap rather than duplicating the LLM-scored signal.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_polls.sql`:

```sql
create table outlet_poll_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references stories(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  response text not null check (response in ('critical', 'balanced', 'friendly')),
  created_at timestamptz not null default now(),
  unique (user_id, story_id, outlet_id)
);

alter table outlet_poll_responses enable row level security;

create policy "users insert own poll response" on outlet_poll_responses
  for insert with check (auth.uid() = user_id);

create policy "users update own poll response" on outlet_poll_responses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Aggregated counts only, no user_id exposed — safe to read publicly even
-- though the underlying table's RLS restricts each row to its own user.
create view outlet_poll_tallies as
  select story_id, outlet_id, response, count(*) as response_count
  from outlet_poll_responses
  group by story_id, outlet_id, response;

grant select on outlet_poll_tallies to anon, authenticated;
```

Apply it in the Supabase SQL Editor as in prior migrations.

- [ ] **Step 2: Write the failing tests for the display-eligibility rule**

Create `lib/polls.test.ts`:

```typescript
import { shouldShowPoll } from "./polls";

describe("shouldShowPoll", () => {
  it("shows the poll for an outlet with no govt-lean score", () => {
    expect(shouldShowPoll({ govt_lean_score: null, is_youtube: false })).toBe(true);
  });

  it("shows the poll for a YouTube outlet even if scored", () => {
    expect(shouldShowPoll({ govt_lean_score: 40, is_youtube: true })).toBe(true);
  });

  it("hides the poll for a non-YouTube outlet that already has a score", () => {
    expect(shouldShowPoll({ govt_lean_score: 40, is_youtube: false })).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- polls`
Expected: FAIL — `Cannot find module './polls'`.

- [ ] **Step 4: Implement**

Create `lib/polls.ts`:

```typescript
export function shouldShowPoll(outlet: { govt_lean_score: number | null; is_youtube: boolean }): boolean {
  return outlet.govt_lean_score === null || outlet.is_youtube;
}

export type PollResponseValue = "critical" | "balanced" | "friendly";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- polls`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing tests for the query functions**

Add to `lib/queries.test.ts`:

```typescript
describe("submitPollResponse", () => {
  function makeMockSupabase(result: { error: any }) {
    const upsert = jest.fn().mockResolvedValue(result);
    const from = jest.fn().mockReturnValue({ upsert });
    return { client: { from } as any, upsert, from };
  }

  it("upserts the response, allowing the user to change their vote", async () => {
    const { client, upsert, from } = makeMockSupabase({ error: null });
    await submitPollResponse(client, "user-1", "story-1", "outlet-1", "balanced");
    expect(from).toHaveBeenCalledWith("outlet_poll_responses");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", story_id: "story-1", outlet_id: "outlet-1", response: "balanced" },
      { onConflict: "user_id,story_id,outlet_id" }
    );
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ error: { message: "boom" } });
    await expect(
      submitPollResponse(client, "user-1", "story-1", "outlet-1", "balanced")
    ).rejects.toThrow("Failed to submit poll response: boom");
  });
});

describe("fetchPollTally", () => {
  function makeMockSupabase(result: { data: any; error: any }) {
    const eq2 = jest.fn().mockResolvedValue(result);
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const select = jest.fn().mockReturnValue({ eq: eq1 });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from };
  }

  it("returns counts per response option", async () => {
    const { client, from } = makeMockSupabase({
      data: [
        { response: "balanced", response_count: 7 },
        { response: "critical", response_count: 2 },
      ],
      error: null,
    });
    const tally = await fetchPollTally(client, "story-1", "outlet-1");
    expect(from).toHaveBeenCalledWith("outlet_poll_tallies");
    expect(tally).toEqual({ critical: 2, balanced: 7, friendly: 0, total: 9 });
  });

  it("returns all zeroes when there are no responses yet", async () => {
    const { client } = makeMockSupabase({ data: [], error: null });
    const tally = await fetchPollTally(client, "story-1", "outlet-1");
    expect(tally).toEqual({ critical: 0, balanced: 0, friendly: 0, total: 0 });
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchPollTally(client, "story-1", "outlet-1")).rejects.toThrow(
      "Failed to fetch poll tally: boom"
    );
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npm test -- queries`
Expected: FAIL — `submitPollResponse`, `fetchPollTally` are not exported.

- [ ] **Step 8: Implement**

Add to `lib/queries.ts`:

```typescript
import { PollResponseValue } from "./polls";

export async function submitPollResponse(
  supabase: SupabaseClient,
  userId: string,
  storyId: string,
  outletId: string,
  response: PollResponseValue
): Promise<void> {
  const { error } = await supabase
    .from("outlet_poll_responses")
    .upsert(
      { user_id: userId, story_id: storyId, outlet_id: outletId, response },
      { onConflict: "user_id,story_id,outlet_id" }
    );
  if (error) throw new Error(`Failed to submit poll response: ${error.message}`);
}

export interface PollTally {
  critical: number;
  balanced: number;
  friendly: number;
  total: number;
}

export async function fetchPollTally(
  supabase: SupabaseClient,
  storyId: string,
  outletId: string
): Promise<PollTally> {
  const { data, error } = await supabase
    .from("outlet_poll_tallies")
    .select("response, response_count")
    .eq("story_id", storyId)
    .eq("outlet_id", outletId);
  if (error) throw new Error(`Failed to fetch poll tally: ${error.message}`);

  const tally: PollTally = { critical: 0, balanced: 0, friendly: 0, total: 0 };
  for (const row of (data ?? []) as { response: PollResponseValue; response_count: number }[]) {
    tally[row.response] = row.response_count;
    tally.total += row.response_count;
  }
  return tally;
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -- queries`
Expected: PASS.

- [ ] **Step 10: Add the poll UI to the Story screen**

In `app/story/[id].tsx`, add imports:

```typescript
import { shouldShowPoll } from "../../lib/polls";
import { submitPollResponse, fetchPollTally, PollTally } from "../../lib/queries";
```

Add state for tallies (keyed by outlet id) and a submit handler inside the component:

```typescript
  const [pollTallies, setPollTallies] = useState<Record<string, PollTally>>({});

  async function handlePollResponse(outletId: string, response: "critical" | "balanced" | "friendly") {
    if (!userId) return;
    try {
      await submitPollResponse(supabase, userId, story!.id, outletId, response);
      const tally = await fetchPollTally(supabase, story!.id, outletId);
      setPollTallies((prev) => ({ ...prev, [outletId]: tally }));
    } catch (err) {
      console.error("Failed to submit poll response:", err);
    }
  }
```

Inside the article-row `.map()`, after the existing scores block (`{hasScores ? ... : null}`), add:

```tsx
            {outlet && shouldShowPoll(outlet) ? (
              <View style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: "#777" }}>
                  Did this outlet feel balanced covering this?
                  {pollTallies[outlet.id]?.total
                    ? ` (${Math.round(
                        (pollTallies[outlet.id].balanced / pollTallies[outlet.id].total) * 100
                      )}% of ${pollTallies[outlet.id].total} readers said balanced)`
                    : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                  {(["critical", "balanced", "friendly"] as const).map((option) => (
                    <Pressable
                      key={option}
                      onPress={(e) => {
                        e.stopPropagation();
                        handlePollResponse(outlet.id, option);
                      }}
                    >
                      <Text style={{ fontSize: 12, color: "#0066cc" }}>{option}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
```

- [ ] **Step 11: Manual verification**

Run: `npx expo start`, press `w`. Open a story with an outlet that has no `govt_lean_score` (an unscored or YouTube outlet). Confirm the poll question and three response buttons appear; tap one, confirm a new row appears in `outlet_poll_responses` in Supabase and the "X% of readers said balanced" text appears after a response is recorded.

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations/0005_polls.sql lib/polls.ts lib/polls.test.ts lib/queries.ts lib/queries.test.ts app/story/[id].tsx
git commit -m "feat: add reader quick-polls for outlets lacking institutional lean data"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Task 1 fixes the known live bug (spec-adjacent, not a spec item itself). Task 2 covers spec §9 Day 18 (headline framing comparison) by extending the existing `lib/comparison.ts` rather than duplicating it. Tasks 3-9 cover spec §7 (CB engagement core: SDT-grounded streak/sides-seen, Hook Model daily-digest trigger, Ethical Nudge Charter enforced as a tested guard function) and spec §6/§9 Day 15-16 (anonymous-first identity via Supabase anonymous auth). Task 10 covers spec §6/§9 Day 15-16's account-upgrade flow (email only — Google OAuth explicitly cut and documented, not silently dropped). Task 11 covers spec §8/§9 Day 17 (WhatsApp share cards, as rich text rather than a rendered image card — documented trade-off in Architecture). Tasks 12-13 cover spec §3's stretch items 3 and 4 (fact-checker cross-referencing, reader quick-polls) in the spec's own stated priority order, explicitly marked cuttable. Stretch item 5 (Hindi-lite) and spec §9's Day 21 buffer work (final APK, demo rehearsal, polish) are out of scope per explicit user instruction, not an oversight.
- **Security checkpoint:** Every new table gets RLS from its migration (Task 3, 12, 13). `profiles`/`user_story_views`/`outlet_poll_responses` are the first tables in this project scoped to `auth.uid()` rather than public-read/service-role-write — verified the policies use `using (auth.uid() = ...)` throughout, and that the `outlet_poll_tallies` view exposes only aggregated counts (no `user_id` column), so its public grant doesn't leak per-user vote data despite bypassing the base table's RLS. No new secrets or service-role usage inside the Expo app (all engagement writes go through the anon-key client, authorized by RLS, matching spec §6's "no separate custom backend"). The Ethical Nudge Charter (spec §7.3) is encoded as `assertEthicalCopy`, unit-tested against real bad examples (Task 8), not left as an unenforced style rule.
- **Type consistency:** `ViewRow` (Task 5) flows unchanged into `recomputeAndSaveStreak` (Task 6). `Profile` (Task 6) flows unchanged into the Feed screen (Tasks 7, 9) and the upgrade-prompt logic (Task 10). `DailyDigestStats`/`buildDailyDigestCopy` (Task 8) is reused as-is by both the notification-reschedule logic (Task 9) and, via `assertEthicalCopy`, by `buildShareText` (Task 11). `PollResponseValue` (Task 13) flows unchanged from `lib/polls.ts` into `lib/queries.ts`'s `submitPollResponse`. No renames found.
