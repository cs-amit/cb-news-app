# India News Transparency App — Design Spec

**Status:** Approved for implementation planning
**Date:** 2026-08-15
**Context:** Solo build, 3-week course deadline (~2026-09-05), dual goal of (1) a working native app and (2) a course project demonstrating applied consumer behavior (CB) concepts. Budget cap: ₹5,000 (optional, free-tier-first).

## 1. Product Thesis

Not "Ground News for India." The product identity is:

> **"See who's telling you the story."** Source and ownership transparency, not left-right balance.

Ground News's pitch is perspective balance on a US-calibrated left-right axis. Research (see `india-news-app-research.html` in the project root) showed this axis doesn't map onto Indian politics, and that Ground News's own ratings are incoherent for Indian outlets (e.g., rating both NDTV and Times of India "Lean Right"). This product's differentiation is structural, not cosmetic:

1. **Ownership transparency** — who owns each outlet, and does that owner have a stake in this specific story. India's media ownership concentration (Reliance/Network18, Adani/NDTV) is a live public trust issue with no existing product built around it.
2. **India-native lean axis** — government-critical ↔ government-friendly (the axis Indians actually use, per "godi media" discourse), not an imported left-right slider.
3. **YouTube-native independent sources as first-class citizens** — not an afterthought. A meaningful share of Indian accountability journalism lives on YouTube, not RSS-fed websites.

### Problem statement (why this matters, in CB terms)

There's a **Think-Say-Feel-Do gap**: Reuters Institute data (2026, India) shows 45% of Indian news consumers say they prefer non-partisan coverage — but actual consumption stays siloed to single, habitual, often algorithmically-reinforced sources. In Theory of Planned Behaviour terms (Ajzen), this isn't an attitude problem or even purely a social-norms problem — it's a **Perceived Behavioural Control** problem: manually cross-checking 5-8 outlets per story is effortful. The product's core value proposition is collapsing that effort into one screen, directly raising PBC — the one lever product design can actually pull.

## 2. Competitive Landscape (summary)

India's aggregator market (DailyHunt, Inshorts, Google News India, NewsPoint, Way2News) competes on speed, brevity, and language coverage — none on source transparency. Incumbents structurally can't follow into this gap: DailyHunt/Inshorts depend on publisher partnerships that labeling bias/ownership would jeopardize; NewsPoint is itself owned by Times Internet. Full analysis in `india-news-app-research.html`.

## 3. v1 Scope

### Core (must-ship, Weeks 1-3 — see roadmap in §9 for exact placement)

| Feature | Description |
|---|---|
| RSS ingestion | ~40 English-language Indian outlets |
| Story clustering | Embedding-based grouping of same-day articles into "stories" |
| Story page | Coverage matrix: all outlets covering a story, with badges |
| Ownership transparency | Curated, citation-backed ownership dataset per outlet |
| Conflict-of-interest badges | Flags when a story's entities intersect an outlet's owner |
| Press-freedom meter | Static RSF/CPJ-sourced context per outlet |
| Govt-critical ↔ govt-friendly axis | LLM-scored per outlet, sampled, with published methodology |
| Sensationalism meter | LLM-scored per outlet |
| Silence signal | Which tracked outlets/channels have *not* covered a story (12-24h lag guard against false positives from feed delay) |
| YouTube-lite | ~15-20 curated channels via channel RSS feeds, spanning the political spectrum, added as coverage-matrix rows |
| CB engagement core | Streak tied to "sides seen" (not raw opens), daily digest notification, ethical-copy rules applied |
| Anonymous-first + optional account upgrade | Zero-friction anonymous entry; optional save-progress prompt (email/Google) after a streak milestone, via Supabase auth linking |
| Android APK | Sideloadable build for course demo |

### Stretch (Week 3, cut from the bottom if behind schedule)

Ranked by cost/value, cheapest and highest-value first — first listed is last cut, last listed is first cut:

1. WhatsApp share cards (growth loop)
2. Headline framing comparison
3. Fact-checker cross-referencing (Alt News, BOOM, Factly — RSS matched to story clusters)
4. Reader quick-polls (crowdsourced lean signal, prioritized on independent/YouTube sources lacking institutional data)
5. Hindi-language lite (a handful of Hindi RSS outlets, only if time remains)

### Explicitly deferred (documented in roadmap, not built in this window)

- Full Hindi/regional-language coverage
- Full YouTube treatment (transcripts, per-video stance analysis)
- Browser extension (separate codebase/platform, own store review process)
- Public social layer: profiles, public lean-meter, follow graph, user-curated playlists — see §6 for why this was cut and what replaces it in v1
- iOS build / Play Store listing (Android sideload only for v1)
- Multi-axis composite ideology score (explicit non-goal — see §4)

## 4. Signal Design: Why Separate Badges, Not One Score

Ownership flag, govt-lean axis, sensationalism meter, and freedom meter are shown as **separate, simple, single-purpose badges** — never merged into one composite "ideology score." A blended multi-axis score from a solo builder with no editorial team to validate against reads as false precision and is an easy target for critics. Each signal stays independently interpretable, with sample size and methodology visible.

## 5. Data Pipeline & Data Model

**Ingestion:** Scheduled Supabase Edge Function polls outlet RSS feeds (~every 2 hours), parses articles, upserts into `articles` (deduped by URL).

**Clustering:** Each article gets a cheap embedding on ingest (via `pgvector`, native to Supabase Postgres). A clustering job groups same-day articles by similarity threshold into `stories` — simple, no heavy ML. The LLM is only invoked per-story afterward, to write a canonical headline/summary — keeps LLM call volume (and cost) low.

**Scoring:** A periodic batch job samples ~15-20 recent articles per outlet, sends them to the LLM once, stores an outlet-level score with sample size and date (powers the public methodology page).

**Conflict-of-interest badges:** At clustering time, entities mentioned in a story are matched against each covering outlet's ownership record.

**Demo safety net:** A static seed set of ~30-50 real, pre-fetched, already-scored stories loads into the same production tables (not a separate "demo mode") — if live ingestion hiccups during the demo, the app still shows real data.

**Core tables:**
- `outlets` — ownership_json, freedom_score, govt_lean_score + sample_size + updated_at, sensationalism_score
- `articles` — outlet_id, title, url, snippet, published_at, embedding, story_id
- `stories` — canonical_headline, summary, first_seen_at
- `story_conflict_flags` — story_id, outlet_id, matched_entity, evidence_text
- `users` — anonymous device ID or linked account, streak_count, sides_seen_count, notification_prefs
- `user_story_views` — powers streak/sides-seen logic
- `youtube_sources` — channel_name, channel_id, rss_url (stretch)
- `fact_checks` — source_org, claim, verdict, matched_story_id (stretch)
- `user_ratings` — schema stubbed only; not built into UI in v1 (cold-start problem — 0 users at launch means no usable signal yet)

## 6. App Architecture

Single Expo/React Native codebase. Android APK for v1; web export (via `react-native-web`, same codebase) is a near-free bonus only if time allows near the end — not built in parallel from day one.

Navigation: Feed → Story Page → Compare Headlines / Share.

The app talks to Supabase directly via its client SDK — no separate custom backend server, appropriate for a solo build.

**Identity:** Anonymous-first (Supabase anonymous auth), with an optional upgrade to a linked, permanent account (email or Google) offered after a streak milestone — not at install. This is deliberately not a public-facing profile: no display of a personal lean-meter, no followers, no playlists. That fuller social-layer idea (raised and explored during design, including public curation/following) was cut for v1 because it: (a) requires real identity + a follow graph + content moderation for user-curated playlists — a second product's worth of scope; and (b) risks undermining the "neutral transparency" brand by turning the app into an identity-signaling space, which cuts against the whole thesis of reducing tribal media consumption. It's documented as a defined post-v1 phase, not dropped.

## 7. Consumer Behavior Design

### 7.1 Umbrella framework: Self-Determination Theory

SDT (Deci & Ryan) is the theoretical backbone for the engagement layer as a whole, not just a Hook-Model feature list:

- **Autonomy** — no signup wall; notification frequency is user-controlled from day one, not opt-out-buried.
- **Competence** — "sides seen" streak functions as a mastery signal, not a guilt mechanic.
- **Relatedness** — WhatsApp share cards and reader quick-polls provide light social participation without requiring the full public-profile/follow-graph layer.

### 7.2 Hook Model, constrained by the ethical charter

| Stage | Design |
|---|---|
| Trigger | Daily digest push notification, informational framing only |
| Action | Anonymous entry, zero signup friction between install and first value |
| Variable reward | The variance is real informational content (different lean/ownership/silence spread per story) — not an artificial randomized mechanic |
| Investment | "Sides seen" streak increments; reader quick-polls are a small investment with a legible payoff (improves the product's own data) |

### 7.3 Ethical Nudge Charter (hard constraints)

- No fear/outrage-optimized copy anywhere (notifications, share cards) — informational framing only: *"Today's top story has 9 sources, and 2 outlets are silent on it"*, never *"See what they're hiding."*
- **Regulatory focus (Higgins):** default to **promotion-framed** copy (gains/ideals — "expand your view"), not **prevention/loss-framed** copy.
- **Prospect theory / loss aversion (Kahneman & Tversky):** explicitly reject loss-framed streak-guilt notifications ("don't lose your streak!") — the standard habit-app mechanic, and the exact pattern this project deliberately avoids.
- No dark patterns: no fake urgency/scarcity, no infinite scroll, easy unsubscribe from every nudge.
- Reward is tied to the mission (reading multiple perspectives), not raw engagement (time-on-app, raw open count).
- Every nudge should be explainable if a user asks "why am I seeing this."

### 7.4 Named risk: Cognitive Dissonance (Festinger)

Showing a user disconfirming coverage can trigger dissonance-*avoidance* (ignore, rationalize) rather than belief-updating — simply exposing people to other perspectives doesn't guarantee attitude change. Mitigation is positioning: the app frames itself as a neutral transparency tool, never as "here's why you're wrong." This is a real limitation to name plainly in the course write-up, not a solved problem.

### 7.5 Supporting mechanisms

- **Social proof / observational learning (Bandura):** reader quick-polls ("73% of readers found this outlet balanced here") and WhatsApp share cards both operate on social-proof/peer-behavior mechanics.
- **Mere exposure effect (Zajonc):** the daily-digest cadence itself builds brand familiarity over time, independent of any single feature — serves the original brand-recall goal.
- **Herzberg two-factor, applied to build/QA priority:** pipeline reliability (no blank feeds, no broken links) is *hygiene* — invisible when correct, catastrophic when broken, and non-negotiable before polishing anything else. Badges/streaks/share cards are *motivators* — real, but worthless to refine on top of a broken hygiene layer.

### 7.6 Deliberately not used

Anchoring and the decoy effect are pricing/choice-architecture tools for a product with paid tiers; v1 has no monetization, so they don't apply. Named explicitly rather than silently omitted, as a demonstration of disciplined (not exhaustive) theory application.

### 7.7 Living document

This CB mapping reflects the course syllabus through the pre-midterm consolidated notes and connected revision sheet as of 2026-08-15. Later course modules (e.g., attitude-change models, ELM) may add further mappings in future revisions.

## 8. Growth Loop

WhatsApp share cards (headline-comparison or silence-signal cards) are the primary acquisition mechanic — WhatsApp is India's #2 news channel (56% per Reuters Institute 2026), and the underlying behavior (forwarding to win arguments in family/group chats) is identity-signaling sharing, which is what actually drives Indian news distribution — not a generic "invite a friend" referral gimmick.

## 9. 3-Week Roadmap

**Week 1 — Core pipeline**
- Days 1-2: Environment setup (Node, Expo, Supabase project), repo scaffold
- Days 3-4: RSS ingestion (~40 outlets), raw article storage
- Days 5-7: Embedding-based story clustering, story feed + story page skeleton (coverage matrix, no badges yet)

**Week 2 — Differentiation data layer**
- Days 8-9: Ownership dataset (~40-60 outlets, cited) + conflict-of-interest badge logic
- Day 10: Press-freedom dataset (RSF/CPJ) + freedom-meter chip
- Days 11-12: Govt-lean + sensationalism LLM scoring, methodology page; silence signal
- Days 13-14: YouTube-lite ingestion (~15-20 curated channels via channel RSS)

**Week 3 — Engagement, growth loop, stretch, demo prep**
- Days 15-16: Habit-loop core (streaks, daily digest notification, ethical-copy pass) + anonymous-to-account upgrade flow
- Day 17: WhatsApp share cards
- Day 18: Headline framing comparison
- Day 19: Fact-checker cross-referencing (cut if behind)
- Day 20: Reader quick-polls (cut if behind)
- Day 21: Buffer — Hindi-lite if time remains, otherwise polish, fallback seed data, final APK build, demo rehearsal

This is a design-level roadmap; the writing-plans skill will turn it into a granular day-by-day implementation plan next.

## 10. Stack & Budget

Fits inside ₹0-2,500 of the ₹5,000 cap using free tiers; paid alternatives noted where relevant. At each build stage requiring a real spend decision, present the free vs. paid option before committing.

| Need | Free path (default) | Paid alternative |
|---|---|---|
| Article ingestion | Direct RSS from outlet feeds | NewsData.io / GNews (rate/latency limits) |
| YouTube data | Channel RSS feeds (no quota) | YouTube Data API (free 10K units/day) if needed |
| Clustering & scoring LLM | Gemini Flash free tier (dev) | Claude Haiku via API (a few hundred ₹/month at this scale) |
| Backend + DB | Supabase free tier (Postgres, pgvector, auth, edge functions) | — |
| App + distribution | Expo/EAS free tier; Android APK sideload for demo | Google Play one-time $25 (~₹2,200) if real distribution wanted later |
| Ownership data | RSF Media Ownership Monitor India, Wikipedia, MCA filings (free) | — |

## 11. Risks & Open Items

- **LLM classification defensibility:** outlet-level lean/sensationalism scores need a published methodology page (sample size, date, model used) to be credible — this is a v1 requirement, not a nice-to-have.
- **Defamation sensitivity:** ownership claims must carry citations; wording stays neutral ("owned by," never "controlled by" or "mouthpiece"); conflict flags are factual, not accusatory.
- **YouTube channel selection is itself an editorial claim** — publish inclusion criteria alongside the channel list.
- **Cognitive dissonance** (§7.4) — exposure to disconfirming coverage isn't guaranteed to change minds; the product's honest claim is transparency, not persuasion.
- **Timeline risk:** 3 weeks solo with limited coding experience is tight even with AI-assisted implementation. The stretch-tier cut order (§3) exists specifically so a slipping schedule has a defined, pre-agreed place to cut from rather than an ad hoc scramble.

## 12. Post-v1 Roadmap (explicitly deferred)

- Full Hindi/regional-language coverage
- Full YouTube integration (transcripts, per-video stance analysis)
- Browser extension (live tracking while browsing other news sites)
- Public social layer: profiles with visible lean-meter, follow graph, user-curated playlists
- iOS build, Play Store listing
- Multi-axis composite score (only if real validation capacity — e.g., an editorial reviewer — becomes available)
