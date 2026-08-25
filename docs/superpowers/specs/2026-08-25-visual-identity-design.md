# Sourced — Visual Identity Design Spec

**Status:** Approved for implementation planning
**Date:** 2026-08-25
**Context:** Companion to `2026-08-15-india-news-transparency-app-design.md`. That spec covers product/data/CB-theory design; this spec covers the visual layer only — the app currently has no branding at all (Expo scaffold defaults: name `cb_app_tmp`, default icons, inline ad-hoc-hex `StyleSheet` styling across `app/index.tsx`, `app/story/[id].tsx`, `app/upgrade.tsx`, `app/methodology.tsx`, no theme file, no dark mode). Produced via `superpowers:brainstorming` with the visual companion tool; every section below was shown as a live mockup and explicitly approved before moving to the next.

## 1. Product Name

**Sourced.** Chosen over Verity, Unspun, and Baseline. Verity was ruled out specifically because `verity.news` (also `improvethenews.org`) is a live, very close competitor — ML-driven bias detection across 5,000+ sources, rated Center/Least-biased by AllSides and MBFC. No naming collision found for "Sourced" in the media-bias/fact-check category. `app.json`'s `name`/`slug` still need updating from the `cb_app_tmp` placeholder as part of implementation.

## 2. Aesthetic Direction

**Modern Data Product** — sans-serif structure, generous white space, card-based layout (Stripe/Linear/Notion family) — chosen over an Editorial Broadsheet direction (serif, warm paper tone) and a Civic Trust direction (deep navy/gold, institutional). Light theme only for v1; dark mode explicitly deferred (matches `app.json`'s current `userInterfaceStyle: "light"`).

## 3. Color System

User-supplied hex palette (not generated), mapped to roles against the approved mockups:

| Role | Hex | Notes |
|---|---|---|
| Primary text | `#111827` | Near-black, slightly cool |
| Secondary/meta text | `#667085` | Timestamps, labels, byline-style text |
| Border/divider | `#D9DDE3` | |
| Subtle card/input background | `#EEF0F2` | |
| Page background | `#FFFFFF` | |
| Elevated surface background | `#F7F7F5` | Alternate off-white for depth |
| Primary interactive | `#315A9B` | Links, buttons, progress fill, streak text |
| Deep navy | `#0B1B33` | Nav/header surfaces, pressed states |
| Bright blue (emphasis) | `#3F4FC4` | Focus rings, active emphasis — used sparingly |
| Red | `#D9382E` | "False" verdict, destructive/warning states |

### Rejected directions (for the record)

An initial round (indigo/teal/violet/slate-gold) was rejected as "too corporate/startup-y." A follow-up warm/editorial round (oxblood/terracotta/brass/ink-only) was explored to counter that. Research into financial-UI color conventions (Stripe's accessible-color-systems writeup; general trust-palette research showing navy/charcoal/slate read as "competent and stable" in Western financial contexts) reframed cool-neutral as an evidence-based trust signal rather than a generic-template default, and the user's own supplied palette — landed on independently — confirmed that direction.

## 4. Semantic Color System

### Fact-check verdicts (True / False / Misleading / Unverified)

Follows the industry-standard red/amber/green ("RAG") traffic-light convention used by PolitiFact's Truth-O-Meter and similar tools — appropriate here because verdict truthfulness is an objective-accuracy category, distinct from political-lean coloring (which this product deliberately avoids — see §5).

| Verdict | Text/icon color | Background |
|---|---|---|
| True | `#2E9B57` (proposed, matched to the red's saturation) | `#E6F3EA` |
| False | `#D9382E` (user-supplied) | `#FBEAE9` |
| Misleading | `#D9A82E` (proposed) | `#FBF1E1` |
| Unverified | `#667085` (user-supplied grey) | `#EEF0F2` |

Accessibility: color is never the sole signal — every verdict badge always renders its text label ("TRUE", "FALSE", etc.) alongside the color, satisfying WCAG's requirement that color not be the only conveyed meaning. Red and green are pulled toward orange/teal respectively (rather than pure opposites) to stay more distinguishable for the most common forms of colorblindness.

### Outlet poll (critical / balanced / friendly)

Deliberately **not** a red/green good-bad scale — none of the three responses is inherently good or bad journalism, and coloring it that way would silently imply a value judgment the product doesn't intend. Instead uses the three-step primary-blue scale as a single-hue intensity ramp: `#0B1B33` (critical) → `#315A9B` (balanced) → `#3F4FC4` (friendly).

### Explicitly avoided: political-lean colors (red/blue)

AllSides/Ground News/Memeorandum use red=right, blue=left as an industry convention — but that's calibrated to US party colors and doesn't apply here: Sourced's data model has no left-right axis (see the govt-lean axis rationale in the main spec, §1). Saffron/orange and green were also ruled out early for carrying real Indian political-party associations (BJP, Congress-adjacent). No UI element in this app encodes political affiliation via color.

## 5. Typography

- **Headlines:** Source Serif 4 (serif) — editorial gravitas for actual story content, and this is fundamentally a reading app.
- **UI chrome** (labels, badges, meta text, buttons): Sora (sans-serif).

Chosen over a full-sans system (System font / Inter / Manrope) specifically to avoid the "generic SaaS template" read that Inter in particular carries in this exact product category (Stripe, Linear, Notion, most YC startups). The serif/sans split is the most distinctive of the four options shown and is a deliberate echo of the "not gimmicky, professional" brief.

**Implementation note:** requires loading two Google Fonts via `expo-font` (`@expo-google-fonts/source-serif-4`, `@expo-google-fonts/sora`), not yet wired into the app.

## 6. Non-Goals / Explicitly Deferred

- Dark mode (locked light-only per `app.json`)
- App icon / splash / adaptive-icon redesign — still Expo scaffold defaults; a separate visual-asset production task
- Custom illustration or iconography system (no vector icon library chosen yet — verdict/poll UI in the approved mockups uses text-only pill badges, no icons)
- Any color encoding of political lean/affiliation (explicit non-goal, not an oversight — see §4)

## 7. Implementation Surface

Files touched: `app.json` (name/slug/icons — icons deferred per §6), a new shared theme/tokens module (doesn't exist yet — everything is currently inline `StyleSheet` hex), and every screen (`app/index.tsx`, `app/story/[id].tsx`, `app/upgrade.tsx`, `app/methodology.tsx`, `app/_layout.tsx`) needs its inline hex values replaced with the token system in §3-4, plus font loading wired via `expo-font`.
