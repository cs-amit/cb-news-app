# Sourced — Social Layer Design Spec

**Status:** Approved for implementation planning
**Date:** 2026-08-26
**Context:** Companion to `2026-08-15-india-news-transparency-app-design.md` (product/data/CB-theory) and `2026-08-25-visual-identity-design.md` (visual identity). Course deadline is ~2026-09-05 — roughly 10 days from this spec's date, on top of finishing live verification of the already-built Week 3 engagement layer and implementing the visual identity spec. See §8 for the explicit cut order this timeline requires.

## 0. Why This Exists (and why it was previously cut)

The original spec (§6) explicitly cut a public social layer for v1 — profiles, follow graph, user-curated playlists — for two reasons: it's "a second product's worth of scope," and it risked turning the app into an identity-signaling space, cutting against the transparency thesis. That conclusion is being revisited, not overturned by accident: the user's reasoning (from in-course social-capital theory, and the observation that Letterboxd succeeded on self-curation with **no recommendation engine**) reframes identity-signaling as compatible with the app's anti-algorithm principle rather than opposed to it — *as long as* what's being signaled is a user's own curation and stated position, never a system-inferred one. That distinction is the design constraint every section below is built around.

## 1. Identity & Auth

No new auth system. Reuses the existing Supabase anonymous-first identity + account-linking upgrade already implemented in `lib/auth.ts` and `app/upgrade.tsx` (email or Google, via Supabase Auth — which natively handles password hashing, email verification, and password-reset-by-email at no extra cost).

**Change:** the upgrade prompt becomes **mandatory**, not optional, the first time a user attempts any public action — making a list public, reposting to their profile, or making their compass badge visible. Anonymous users can still do everything privately (take the quiz, build private lists) but cannot publish until upgraded.

A **public handle** (display name, not the login email/credential) is chosen during that same upgrade step and becomes the user's profile URL slug.

**Ownership/security:** enforced entirely at the database level via Postgres Row-Level-Security policies keyed to `auth.uid()` — the same pattern already used for `outlet_poll_responses` ("users update own poll response"). A stranger with a profile URL can always view public content, never mutate it, regardless of what the client sends.

## 2. Profile Pages

One route: `app/profile/[handle].tsx`.

- **Visiting someone else's profile:** read-only. Shows their compass badge (if public), their public lists, their reposts.
- **Visiting your own profile:** same route, but renders edit affordances (reorder list items, toggle a list private/public, delete) when the viewer's `auth.uid()` matches the profile's owner.

No follow graph, no activity feed of other users, no discovery/search beyond direct profile links, for v1 — explicitly out of scope (see §9).

## 3. Curated Lists & Reposts

**Data model:**

```
lists
  id            uuid pk
  owner_id      uuid references auth.users(id)
  name          text not null
  description   text
  is_public     boolean not null default false
  created_at    timestamptz not null default now()

list_items
  id            uuid pk
  list_id       uuid references lists(id) on delete cascade
  story_id      uuid references stories(id) on delete cascade
  position      integer not null
  added_at      timestamptz not null default now()
  unique (list_id, story_id)
```

Every user gets one default list ("Reposts," not user-deletable) created at upgrade time, covering the one-tap "share this story to my profile" case. Named custom lists cover the Letterboxd-style curated-collection case ("Stories that changed my mind," "Follow this ongoing story," etc.). Both use the identical mechanism — a default list is not a special case in the schema, just a list flagged non-deletable.

RLS: `is_public = true` lists/items are readable by anyone; all mutation requires `owner_id = auth.uid()`.

## 4. Political Compass: Quiz

**v1 scope: one axis** — government-critical ↔ government-friendly — because it's the only axis with real per-outlet and per-poll-response data behind it (`outlets.govt_lean_score`, `outlet_poll_responses`). A full multi-axis "pentagon" (economic policy, individual rights, national identity, social values, centre-vs-state — the shape used by the Indian reference tool rajneetiyantra.in, which this design is informed by) is a strong post-v1 direction once more axes have real scoring data behind them (see §9) — building quiz-only static axes with no real drift data behind them was considered and rejected as inconsistent (a badge that claims to "move with you" on 4 of 5 axes but never actually does).

Quiz: a short set of India-contextualized questions on this one axis (not imported left-right framing — matches the govt-critical/friendly axis already used elsewhere in the product, e.g. §4 of the main spec's "godi media" framing) produces a starting position on a **-100 (critical) to +100 (friendly)** scale.

**Explicit, visible product promise**, shown on the quiz result screen and the methodology page: *this position never changes what stories or outlets you see. It's a badge, not a filter.* This is a hard product constraint, not just copy — no code path may read a user's compass position to rank, filter, or select content shown to them.

## 5. Political Compass: Drift Mechanism

Every time a user answers the existing outlet poll (critical / balanced / friendly — `outlet_poll_responses`, already shipped in Week 3), that answer now does two things:

1. **Unchanged:** contributes to the public, anonymous crowdsourced tally (`outlet_poll_tallies`) already shown on the story page.
2. **New:** nudges the user's own private compass position.

Mapping: `critical → -100`, `balanced → 0`, `friendly → +100` (target values on the same axis as §4). Each poll answer moves the user's position a small step toward that target:

```
new_position = old_position + WEIGHT × (target − old_position)
```

`WEIGHT` ≈ 0.02, so a single answer moves the position ~2% of the remaining distance — one poll tap cannot meaningfully move the badge. A **hard weekly cap** (≈ ±3 points/week total, regardless of poll volume that week) guarantees the "moves slowly, never reactively" property even for a user who answers many polls in one sitting.

This is deliberately driven only by **explicit user actions** (answering a poll), never by passive behavior (which outlets/articles a user merely reads) — both a simpler signal and a more honest one to describe to users: *"we only move your position when you tell us something."*

## 6. Feed Topics

A `topic` column on `stories` (e.g. politics, business, science-tech, sports, entertainment) with a user-selectable filter on the feed screen. This is explicit, user-driven filtering — orthogonal to, and never influenced by, the compass position from §4-5. Requires new tagging logic at clustering/summarization time (LLM-assigned or derived from RSS feed category) — genuinely new pipeline work, not a free addition; see cut order in §8.

## 7. Explicitly Deferred: Chat

Chatrooms, group chats, and story-sharing into personal DMs are **not built in this window.** Real-time messaging infrastructure, moderation, and India's IT Rules 2021 intermediary obligations for hosting political discussion are a substantial, separate scope commitment that this timeline cannot responsibly absorb alongside the rest of this spec. Documented here as a defined, designed-but-deferred post-v1 direction — the same treatment the original spec (§6) gave the earlier social-layer cut — not dropped, not silently descoped.

## 8. Cut Order (if the remaining ~10 days run short)

Ranked highest-priority first (first listed = last cut):

1. **Auth-gating + quiz + static compass badge + profile page + lists/reposts** — delivers the core pitch ("a Letterboxd for news opinions") on its own even with nothing else in this spec built.
2. **Drift mechanism** (§5) — upgrades the badge from static-at-quiz-time to a living signal. The app is coherent without it (badge just stays put after the quiz).
3. **Visual rebrand implementation** — wiring the already-approved palette/typography (`2026-08-25-visual-identity-design.md`) across the real screens. Important for how the demo looks, independent of the social layer's function.
4. **Feed topics** (§6) — organizational convenience, fully independent of the social-layer pitch; cut first if time runs out.

## 9. Non-Goals (v1)

- Follow graph / discovery / search across profiles
- Any use of compass position to filter, rank, or personalize content (hard constraint, not a v1 scope note — see §4)
- Multi-axis compass beyond the single govt-critical/friendly axis
- Chat in any form (§7)
- Caste, religion, or gender self-identification anywhere in the product — not proposed or discussed as in-scope for this spec
