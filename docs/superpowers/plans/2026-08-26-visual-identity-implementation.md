# Visual Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every screen's ad-hoc inline hex colors and default fonts with the approved design tokens (name, palette, semantic verdict/poll colors, typography), and update `app.json` off its Expo scaffold defaults.

**Architecture:** A single `lib/theme.ts` module exports typed color and font-family constants. Every existing screen is edited in place to import from it instead of hardcoding hex strings — no new UI framework, no restructuring of how screens are built (still plain React Native `StyleSheet`-style inline styles, per the codebase's existing convention).

**Tech Stack:** `expo-font` + `@expo-google-fonts/source-serif-4` + `@expo-google-fonts/sora` for the two Google Fonts the approved spec calls for.

**Spec:** `docs/superpowers/specs/2026-08-25-visual-identity-design.md` — full spec (name, palette, semantic colors, typography).

**Execution order:** Priority 3 of 4 in `2026-08-26-social-layer-design.md` §8's cut order. Execute **after** `2026-08-26-social-layer-foundation.md` (Task 7 of this plan styles `app/quiz.tsx` and `app/profile/[handle].tsx`, which only exist once that plan has run) and **after or independent of** `2026-08-26-compass-drift.md` (no file overlap). Independent of `2026-08-26-feed-topics.md`.

## Global Constraints

- Exact hex values are non-negotiable — copy verbatim from spec §3-4, never approximate or "close enough."
- Light theme only — do not add `useColorScheme`/dark-mode branching anywhere (spec §6, `app.json`'s `userInterfaceStyle: "light"` stays as-is).
- No icon/splash-asset changes in this plan (spec §6, explicitly deferred) — only `app.json`'s `name`/`slug` fields change, not `icon`/`android.adaptiveIcon`/`web.favicon`.
- Every verdict/poll badge must always render its text label alongside its color (spec §4's accessibility requirement) — do not simplify any badge to color-only.

---

## File Structure

- `lib/theme.ts` — new: all color and font-family tokens.
- `app.json` — modify: `name`/`slug` off the `cb_app_tmp` placeholder.
- `app/_layout.tsx` — modify: load the two Google Fonts, gate rendering until loaded.
- `app/index.tsx`, `app/story/[id].tsx`, `app/upgrade.tsx`, `app/methodology.tsx`, `app/quiz.tsx`, `app/profile/[handle].tsx` — modify: replace inline hex/default fonts with `lib/theme.ts` tokens.

---

### Task 1: Install font packages

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the packages**

```bash
npx expo install expo-font @expo-google-fonts/source-serif-4 @expo-google-fonts/sora
```

- [ ] **Step 2: Verify they're in `package.json`**

Confirm `expo-font`, `@expo-google-fonts/source-serif-4`, and `@expo-google-fonts/sora` now appear under `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add font packages for the approved typography spec"
```

---

### Task 2: Theme tokens module

**Files:**
- Create: `lib/theme.ts`

**Interfaces:**
- Produces: `colors` (object with every role from spec §3-4), `fonts` (object with `headline`/`ui` family names), `verdictColors`, `pollColors`

- [ ] **Step 1: Write the theme module**

```ts
// Design tokens from docs/superpowers/specs/2026-08-25-visual-identity-design.md.
// Exact hex values are non-negotiable — copy from the spec, never approximate.

export const colors = {
  textPrimary: "#111827",
  textSecondary: "#667085",
  border: "#D9DDE3",
  surfaceSubtle: "#EEF0F2",
  background: "#FFFFFF",
  surfaceElevated: "#F7F7F5",
  primary: "#315A9B",
  navy: "#0B1B33",
  emphasis: "#3F4FC4",
  red: "#D9382E",
} as const;

export const fonts = {
  headline: "SourceSerif4_700Bold",
  headlineRegular: "SourceSerif4_600SemiBold",
  ui: "Sora_400Regular",
  uiSemiBold: "Sora_600SemiBold",
} as const;

export type Verdict = "True" | "False" | "Misleading" | "Unverified";

export const verdictColors: Record<Verdict, { text: string; background: string }> = {
  True: { text: "#2E9B57", background: "#E6F3EA" },
  False: { text: colors.red, background: "#FBEAE9" },
  Misleading: { text: "#D9A82E", background: "#FBF1E1" },
  Unverified: { text: colors.textSecondary, background: colors.surfaceSubtle },
};

export type PollResponse = "critical" | "balanced" | "friendly";

export const pollColors: Record<PollResponse, string> = {
  critical: colors.navy,
  balanced: colors.primary,
  friendly: colors.emphasis,
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/theme.ts
git commit -m "feat: add design token module for the approved visual identity"
```

---

### Task 3: Load fonts at the app root

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Gate rendering on font load**

```tsx
import { Stack } from "expo-router";
import { useFonts, SourceSerif4_600SemiBold, SourceSerif4_700Bold } from "@expo-google-fonts/source-serif-4";
import { Sora_400Regular, Sora_600SemiBold } from "@expo-google-fonts/sora";
import { ActivityIndicator, View } from "react-native";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SourceSerif4_600SemiBold,
    SourceSerif4_700Bold,
    Sora_400Regular,
    Sora_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

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

Note: keep whichever `Stack.Screen` entries already exist in the file at the time this task runs — if `2026-08-26-social-layer-foundation.md` Task 10 already added `quiz` and `profile/[handle]`, this step only adds the font-loading gate around the existing list, it does not remove or duplicate entries.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manually verify via the dev-client build**

Run `npx expo start --dev-client`, confirm the app briefly shows a spinner then loads normally, with no font-loading error in the Metro log.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: load Source Serif 4 and Sora at app startup"
```

---

### Task 4: Update `app.json` naming

**Files:**
- Modify: `app.json`

- [ ] **Step 1: Update `name` and `slug`**

Change:
```json
"name": "cb_app_tmp",
"slug": "cb_app_tmp",
```
to:
```json
"name": "Sourced",
"slug": "sourced",
```
Leave every other field (`icon`, `android.adaptiveIcon`, `android.package`, `web.favicon`, `extra.eas.projectId`) untouched — icon/splash assets are explicitly deferred (spec §6), and `android.package`/`eas.projectId` are identifiers, not display names; changing them would require a fresh EAS build registration, out of scope here.

- [ ] **Step 2: Verify the app still builds**

Run `npx expo start --dev-client`, confirm the dev-client build still connects (app identity/package name is unchanged, only the display name changed).

- [ ] **Step 3: Commit**

```bash
git add app.json
git commit -m "chore: rename app from cb_app_tmp to Sourced"
```

---

### Task 5: Apply theme to the feed screen

**Files:**
- Modify: `app/index.tsx`

- [ ] **Step 1: Replace every inline hex color and add font families**

Read the current file first (it may have already been modified by `2026-08-26-social-layer-foundation.md` Tasks 10-11 — this task must preserve those changes, only touching styling). Replace every inline `color:`/`backgroundColor:`/`borderColor:` hex value with the matching `colors.*` token from `lib/theme.ts` (import `{ colors, fonts }` at the top), per this mapping:
- `"#f5f5f5"` (prompt banner backgrounds) → `colors.surfaceSubtle`
- `"#0066cc"` (links/actions) → `colors.primary`
- `"#777"` (secondary/dismiss text) → `colors.textSecondary`
- `"#eee"` (borders) → `colors.border`
- `"#555"` (summary text) → `colors.textSecondary`
- Default text → `colors.textPrimary`

Add `fontFamily: fonts.headline` to the story headline `Text` style (`fontSize: 16, fontWeight: "600"`), and `fontFamily: fonts.ui` to every other `Text` style in the file. Remove `fontWeight` where the chosen font-family variant already encodes the weight (e.g. use `fonts.uiSemiBold` instead of `fontFamily: fonts.ui, fontWeight: "600"` together) — React Native does not reliably apply `fontWeight` on top of a custom `fontFamily`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manually verify via the dev-client build**

Open the feed screen, confirm headlines render in the serif font, all other text in Sora, and no default-blue/gray placeholder colors remain.

- [ ] **Step 4: Commit**

```bash
git add app/index.tsx
git commit -m "style: apply approved theme tokens to the feed screen"
```

---

### Task 6: Apply theme to the story screen, including verdict and poll badges

**Files:**
- Modify: `app/story/[id].tsx`

- [ ] **Step 1: Replace inline hex colors and wire the semantic verdict/poll colors**

Import `{ colors, fonts, verdictColors, pollColors, Verdict, PollResponse }` from `../../lib/theme`.

Apply the same text/border/link color mapping as Task 5 (`#0066cc` → `colors.primary`, `#555`/`#777`/`#999` → `colors.textSecondary`, `#eee` → `colors.border`, `#a00` → `colors.red`).

Replace the fact-check rendering (`{factCheck.source_org}: {factCheck.verdict}`) with a badge that uses `verdictColors[factCheck.verdict as Verdict]` for its background/text color, keeping the verdict text label always visible next to the color (spec §4 accessibility requirement — never color-only):

```tsx
<View
  style={{
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: verdictColors[factCheck.verdict as Verdict]?.background ?? colors.surfaceSubtle,
  }}
>
  <Text
    style={{
      fontSize: 11,
      fontWeight: "700",
      fontFamily: fonts.uiSemiBold,
      color: verdictColors[factCheck.verdict as Verdict]?.text ?? colors.textSecondary,
    }}
  >
    {factCheck.verdict.toUpperCase()}
  </Text>
</View>
```

Replace the poll option buttons (`critical`/`balanced`/`friendly` `Text` elements) with pill badges using `pollColors[option]` as background and white text:

```tsx
<Pressable
  key={option}
  onPress={(e) => {
    e.stopPropagation();
    handlePollResponse(outlet.id, option);
  }}
  style={{
    backgroundColor: pollColors[option as PollResponse],
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  }}
>
  <Text style={{ fontSize: 12, fontFamily: fonts.uiSemiBold, color: "#FFFFFF" }}>{option}</Text>
</Pressable>
```

Apply `fontFamily: fonts.headline` to the story headline `Text`, `fontFamily: fonts.ui`/`fonts.uiSemiBold` to every other `Text`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manually verify via the dev-client build**

Open a story with a fact-check and a poll-eligible outlet. Confirm: the verdict badge shows the correct color per its verdict word (e.g. "TRUE" renders green-on-light-green, "FALSE" red-on-light-red) with the label always visible; the three poll options render as three distinctly-colored pills; headline is serif, everything else Sora.

- [ ] **Step 4: Commit**

```bash
git add "app/story/[id].tsx"
git commit -m "style: apply approved theme tokens and semantic verdict/poll colors to the story screen"
```

---

### Task 7: Apply theme to the remaining screens

**Files:**
- Modify: `app/upgrade.tsx`, `app/methodology.tsx`, `app/quiz.tsx`, `app/profile/[handle].tsx`

`app/quiz.tsx` and `app/profile/[handle].tsx` only exist once `2026-08-26-social-layer-foundation.md` has run — if either file doesn't exist yet when this task executes, skip that file's step below and note it in the commit message as skipped pending that plan.

- [ ] **Step 1: Replace the full contents of `app/upgrade.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import { isValidHandle } from "../lib/handle";
import { claimHandle, createDefaultRepostsList } from "../lib/queries";
import { colors, fonts } from "../lib/theme";

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
      console.error("Failed to claim handle after upgrade:", err);
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <View style={{ padding: 16, backgroundColor: colors.background, flex: 1 }}>
        <Text style={{ fontSize: 16, fontFamily: fonts.headline, color: colors.textPrimary }}>
          Check your email
        </Text>
        <Text style={{ marginTop: 8, fontFamily: fonts.ui, color: colors.textSecondary }}>
          Tap the confirmation link we sent to {email.trim()}, then reopen Sourced. Your streak,
          reading history, and new handle carry over exactly as they are.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 16, backgroundColor: colors.background, flex: 1 }}>
      <Text style={{ fontSize: 16, fontFamily: fonts.headline, color: colors.textPrimary }}>
        Save your progress
      </Text>
      <Text style={{ marginTop: 8, fontFamily: fonts.ui, color: colors.textSecondary }}>
        Add an email so your streak and reading history aren't lost if you reinstall, and pick a
        handle so you can share lists and your profile publicly.
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        style={{
          marginTop: 16,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 4,
          padding: 12,
          fontFamily: fonts.ui,
          color: colors.textPrimary,
        }}
      />
      <TextInput
        value={handle}
        onChangeText={setHandle}
        placeholder="handle (lowercase, 3-20 chars)"
        autoCapitalize="none"
        style={{
          marginTop: 12,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 4,
          padding: 12,
          fontFamily: fonts.ui,
          color: colors.textPrimary,
        }}
      />
      {status === "error" ? (
        <Text style={{ marginTop: 8, fontFamily: fonts.ui, color: colors.red }}>
          Couldn't save that: {errorMessage}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", marginTop: 16, gap: 16 }}>
        <Pressable onPress={handleSubmit} disabled={status === "submitting"}>
          <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.primary }}>
            {status === "submitting" ? "Sending..." : "Send confirmation link"}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={{ fontFamily: fonts.ui, color: colors.textSecondary }}>Maybe later</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Replace the full contents of `app/methodology.tsx`**

Apply the token mapping to the version of this file that already includes the "Political compass" section added by `2026-08-26-social-layer-foundation.md` Task 11 — every `fontWeight: "700"`/`"600"` heading `Text` gets `fontFamily: fonts.headline` added (keep the `fontWeight` too, serif bold renders correctly with both set), every body `Text`'s `color: "#333"` becomes `color: colors.textPrimary` and gains `fontFamily: fonts.ui`:

```tsx
import { useEffect, useState } from "react";
import { ScrollView, Text, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
import { fetchMethodologyStats, MethodologyStats } from "../lib/queries";
import { colors, fonts } from "../lib/theme";

export default function MethodologyScreen() {
  const [stats, setStats] = useState<MethodologyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMethodologyStats(supabase)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ScrollView style={{ padding: 16, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 20, fontWeight: "700", fontFamily: fonts.headline, color: colors.textPrimary }}>
        Methodology
      </Text>

      <Text style={{ fontSize: 16, fontWeight: "600", fontFamily: fonts.headline, color: colors.textPrimary, marginTop: 20 }}>
        Ownership
      </Text>
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        Ownership data is curated from public sources (Wikipedia and press reporting) and every claim
        carries a citation, shown on each outlet's badge. Wording is kept
        neutral ("owned by") — we never use loaded terms like "controlled by" or "mouthpiece."
      </Text>

      <Text style={{ fontSize: 16, fontWeight: "600", fontFamily: fonts.headline, color: colors.textPrimary, marginTop: 20 }}>
        Conflict-of-interest flags
      </Text>
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        A story is flagged for a covering outlet when the story's text mentions that outlet's owner (or a
        known alias, e.g. a parent company or controlling individual). This is a deterministic text match
        against the ownership dataset above, not an AI judgment call — the matched phrase and surrounding
        text are shown as evidence on each flag.
      </Text>

      <Text style={{ fontSize: 16, fontWeight: "600", fontFamily: fonts.headline, color: colors.textPrimary, marginTop: 20 }}>
        Press freedom
      </Text>
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        Every outlet starts from a shared baseline of 32/100, derived from RSF's World Press Freedom Index
        score for India (31.96/100, rank 157 of 180, 2026 — rsf.org/en/country/india). A small number of
        outlets carry a documented, citable press-freedom incident specific to that outlet (e.g. a raid, an
        ownership change reported as an editorial-independence concern, or a journalist's arrest tied to
        their reporting); those outlets are scored 22/100, with the incident and citation shown on the
        outlet's badge. This is a flat, binary adjustment rather than a severity ranking, which would
        require editorial judgment this solo build has no way to validate.
      </Text>

      <Text style={{ fontSize: 16, fontWeight: "600", fontFamily: fonts.headline, color: colors.textPrimary, marginTop: 20 }}>
        Govt-lean &amp; sensationalism scores
      </Text>
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        Both scores come from sampling up to 20 of an outlet's most recent headlines and sending them to
        Gemini (gemini-flash-latest) in a single batched request covering every eligible outlet at once,
        run once daily. Govt-lean runs 0 (consistently government-critical) to 100 (consistently
        government-friendly); sensationalism runs 0 (plain, factual) to 100 (highly sensational). An outlet
        needs at least 5 sampled headlines before it gets a score, and every score shows its sample size
        and last-updated date.
        {stats
          ? ` As of the last run: ${stats.scoredOutletCount} of ${
              stats.outletCount + stats.youtubeCount
            } outlets scored${
              stats.lastScoredAt
                ? `, most recently on ${new Date(stats.lastScoredAt).toLocaleDateString()}`
                : ""
            }.`
          : ""}
      </Text>

      <Text style={{ fontSize: 16, fontWeight: "600", fontFamily: fonts.headline, color: colors.textPrimary, marginTop: 20 }}>
        Silence signal
      </Text>
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        A story only lists outlets as "not yet covered by" once it's at least 18 hours old — this guards
        against false positives from normal RSS polling delay, not every outlet failing to cover a story
        within the first hour. An outlet only counts as active (and therefore eligible to be flagged
        silent) if it has published at least one article in the trailing 7 days.
      </Text>

      <Text style={{ fontSize: 16, fontWeight: "600", fontFamily: fonts.headline, color: colors.textPrimary, marginTop: 20 }}>
        YouTube-lite inclusion criteria
      </Text>
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        Channels were selected to span the full range of editorial relationships to India's central
        government — from independent, non-corporate creators whose journalists have publicly described
        facing pressure or resigned over editorial-independence concerns, to channels owned by conglomerates
        or individuals with documented political affiliations or government regulatory advisories, to wire
        services and mainstream broadcasters with no strong documented lean. Every channel had to be
        primarily a news or current-affairs outlet — general, political, or business/economic — rather than
        entertainment or lifestyle content, and had to maintain an active public RSS feed. Ownership,
        editorial leadership, and any documented lean are sourced from Wikipedia or mainstream press
        reporting, not this app's own editorial judgment, and are cited per channel. This list is not exhaustive and will be revisited periodically; inclusion is not an
        endorsement or condemnation of any channel.
      </Text>

      <Text style={{ fontSize: 16, fontWeight: "600", fontFamily: fonts.headline, color: colors.textPrimary, marginTop: 20 }}>
        Political compass
      </Text>
      <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textPrimary }}>
        Your compass position (from the quiz on your profile) never changes which stories or
        outlets you're shown. It's a badge you can choose to share, not a filter — this app
        doesn't personalize your feed based on it. It also only moves in small steps over time,
        driven by your own outlet-poll answers, never by which articles you happen to read.
      </Text>

      {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : null}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Replace the full contents of `app/quiz.tsx`**

```tsx
import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import { QUIZ_QUESTIONS, scoreQuizAnswers } from "../lib/compass";
import { setCompassPosition } from "../lib/queries";
import { colors, fonts } from "../lib/theme";

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
      <View style={{ padding: 16, backgroundColor: colors.background, flex: 1 }}>
        <Text style={{ fontSize: 18, fontFamily: fonts.headline, color: colors.textPrimary }}>
          Your position: {resultPosition}
        </Text>
        <Text style={{ marginTop: 8, fontFamily: fonts.ui, color: colors.textSecondary }}>
          -100 is government-critical, +100 is government-friendly. This is a badge, not a filter
          — it never changes which stories or outlets you see.
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.primary }}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={{ padding: 16, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 18, fontFamily: fonts.headline, color: colors.textPrimary }}>
        Where do you stand?
      </Text>
      <Text style={{ marginTop: 8, fontFamily: fonts.ui, color: colors.textSecondary }}>
        This never changes what you're shown — it's a badge for your profile, not a filter.
      </Text>
      {QUIZ_QUESTIONS.map((q) => (
        <View key={q.id} style={{ marginTop: 20 }}>
          <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>{q.statement}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {LIKERT_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: option.value }))}
                style={{
                  borderWidth: 1,
                  borderColor: answers[q.id] === option.value ? colors.primary : colors.border,
                  borderRadius: 4,
                  padding: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.ui,
                    color: answers[q.id] === option.value ? colors.primary : colors.textPrimary,
                  }}
                >
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
        <Text style={{ fontFamily: fonts.uiSemiBold, color: allAnswered ? colors.primary : colors.textSecondary }}>
          {status === "submitting" ? "Saving..." : "See my position"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Replace the full contents of `app/profile/[handle].tsx`**

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
import { colors, fonts } from "../../lib/theme";

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
  if (error || !profile)
    return (
      <Text style={{ padding: 16, fontFamily: fonts.ui, color: colors.textPrimary }}>
        {error ?? "Profile not found."}
      </Text>
    );

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 20, fontFamily: fonts.headline, color: colors.textPrimary }}>
        @{profile.handle}
      </Text>
      {profile.compass_position !== null ? (
        <Text style={{ marginTop: 4, fontFamily: fonts.ui, color: colors.textSecondary }}>
          Compass position: {profile.compass_position}
        </Text>
      ) : null}
      {isOwnProfile ? (
        <Pressable onPress={() => router.push("/quiz")} style={{ marginTop: 8 }}>
          <Text style={{ fontFamily: fonts.ui, color: colors.primary }}>Retake the quiz →</Text>
        </Pressable>
      ) : null}
      <Text style={{ marginTop: 20, fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>
        {isOwnProfile ? "Your lists" : "Public lists"}
      </Text>
      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontFamily: fonts.uiSemiBold, color: colors.textPrimary }}>{item.name}</Text>
            {item.description ? (
              <Text style={{ fontFamily: fonts.ui, color: colors.textSecondary }}>{item.description}</Text>
            ) : null}
            {!item.is_public ? (
              <Text style={{ fontSize: 11, fontFamily: fonts.ui, color: colors.red }}>Private</Text>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ fontFamily: fonts.ui, color: colors.textSecondary, marginTop: 8 }}>
            No lists yet.
          </Text>
        }
      />
    </View>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Manually verify via the dev-client build**

Open each of the four screens, confirm consistent styling with the feed and story screens (no leftover default-blue links, no default system font on headings).

- [ ] **Step 7: Commit**

```bash
git add app/upgrade.tsx app/methodology.tsx app/quiz.tsx "app/profile/[handle].tsx"
git commit -m "style: apply approved theme tokens to upgrade, methodology, quiz, and profile screens"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (name) → Task 4. §2 (aesthetic direction — sans structure, cards) → already the existing screen structure, no task needed beyond color/type. §3 (palette) → Tasks 2, 5-7. §4 (semantic verdict/poll colors) → Tasks 2, 6. §5 (typography) → Tasks 1, 3, 5-7. §6 (non-goals: dark mode, icons) → explicitly not touched by any task, called out in Global Constraints. §7 (implementation surface) → every listed file has a task.
- **Accessibility check:** Task 6 confirms every verdict badge keeps its text label alongside color, per spec §4's WCAG requirement — flagged explicitly in the task so a reviewer checks it wasn't simplified away.
