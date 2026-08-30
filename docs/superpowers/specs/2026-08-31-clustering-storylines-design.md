# Sourced — Clustering Fix + Storyline Layer Design Spec

**Status:** Approved for implementation planning
**Date:** 2026-08-31
**Context:** Course deadline ~2026-09-05. The core product pitch — "compare how outlets frame the same story" — only has material on the ~14% of stories that cluster multi-source (mean 1.36 sources/story, median 1, 86% single-source). Diagnostics (SQL against prod, sampled 25 recent single-source headlined stories) found the majority of that 86% is genuinely single-outlet regional filler, but ~20% of the sample *are* the same event covered elsewhere, missed by the current `SIMILARITY_THRESHOLD = 0.86` — notably cross-language/Hinglish pairs, which land ~0.75–0.85 cosine (example: "UP Extends Free Bus Travel To Women Above 60" vs. "UP Govt Big Gift For Women: 60+ महिलाओं…" = 0.846). Separately, related-but-distinct stories over days (an announcement, then an Aadhaar-linking detail, then a passenger-count follow-up on the same policy) form one storyline with no schema layer to group them. This spec fixes both: a guarded threshold drop for clustering, and a new storyline layer, per Q1's "both" answer in the paused architectural brainstorm (see prior session's `clustering-undermerge-brainstorm` memory).

**Scope:** backend/pipeline only. Surfacing storylines in the UI (e.g. a "part of an ongoing story" section on the story screen) is an explicit fast-follow, not part of this spec.

## 1. Entity Extraction (shared utility)

New `lib/entities.ts`: `extractEntityKeys(text: string): string[]`.

Tokenizes on whitespace/punctuation and keeps:
- purely numeric tokens (ages, percentages, figures — e.g. "60", "9.26"), and
- capitalized-word tokens of 2+ characters, filtered against a small stopword list (sentence-initial common words like "The", "A", "Is", "To", "For"). The 2-char floor (not 3+) is deliberate: short ALL-CAPS state/party abbreviations ("UP", "US", "PM", "BJP") are exactly the kind of entity this needs to catch — the worked example above depends on "UP" surviving extraction.

All returned tokens are lowercased before comparison so overlap checks are case-insensitive. No LLM call — this is a cheap, deterministic, synchronous function.

**Known limitation, not solved here:** this catches shared proper nouns and numbers between an English headline and a transliterated/Hinglish one (the diagnosed case), but a pure-Devanagari-script headline has no capitalization signal, so entity overlap against a pure-English headline degrades to numeral-matching only. Acceptable for v1; a real fix would need translation or multilingual NER, which is out of scope for this timeline.

## 2. Clustering Fix: Dual-Threshold + Entity Guard

**Current behavior** (`scripts/cluster/similarity.ts`): `clusterBySimilarity` is greedy single-link — an article joins the first existing cluster where cosine similarity to *any* member is ≥ `SIMILARITY_THRESHOLD` (0.86), else it starts a new cluster.

**Change:** replace the single threshold with two, plus an entity-overlap guard on the lower one:

- cosine ≥ `SIMILARITY_THRESHOLD_HIGH` (0.86, unchanged) → merge, no entity check needed.
- `SIMILARITY_THRESHOLD_MID` (0.78) ≤ cosine < 0.86 → merge only if entity-key overlap between the pair ≥ 1.
- cosine < 0.78 → never merge.

0.78 was chosen from the diagnostic sweep (at 0.82 threshold, 3/25 of the sampled misses would newly merge; at 0.78, 5/25 — the wider net is safe here specifically because it's gated by the entity check, unlike a bare threshold drop which would also pull in more false positives). The diagnosed example (cosine 0.846, shared entities "UP" and "60") merges under this rule; a bare threshold drop to 0.82 would also have caught it, but 0.78+entity-guard also catches lower-similarity true positives that a bare 0.82 threshold would still miss, without the false-merge risk a bare 0.78 threshold would carry.

**Implementation:**
- `EmbeddedArticle` (in `similarity.ts`) gains `entityKeys: string[]`.
- `clusterBySimilarity(articles, highThreshold, midThreshold)`: for each existing cluster, the match check becomes pairwise against each existing member — `cosine(existing, candidate) >= highThreshold || (cosine(existing, candidate) >= midThreshold && overlapCount(existing.entityKeys, candidate.entityKeys) >= 1)`.
- `articles` gets a new nullable column `entity_keys text[]`, computed once at embed-time (same point `embedding` is computed and persisted in `clusterStories.ts`) and persisted alongside it, so it isn't recomputed on every run.
- The anchor query in `clusterStories.ts` (currently `select("id, story_id, embedding")`) adds `entity_keys` so previously-clustered anchors also participate in the entity-guarded comparison.

**Error handling:** `extractEntityKeys` is pure/synchronous and cannot fail; no new failure mode is introduced. If `entity_keys` is null/missing on an older row (pre-migration data), overlap count is treated as 0 — such rows fall back to the unchanged high-threshold-only behavior.

## 3. Storyline Layer

**Data model** (migration `0009_storylines`):

```
storylines
  id                uuid pk default gen_random_uuid()
  title             text
  created_at        timestamptz not null default now()

stories (additions)
  storyline_id      uuid references storylines(id)
  pooled_embedding  vector(768)
  entity_keys       text[]
```

`pooled_embedding` and `entity_keys` on `stories` are a cache: the mean of member articles' embeddings, and the union of their entity keys, computed once when the story is first considered for storyline assignment. This avoids re-pooling every run. Known approximation: a story that keeps accruing new articles after its pooled fields are cached won't have them recomputed — acceptable for v1, since the storyline signal only needs to be roughly right, not exact.

**Assignment algorithm** (new `scripts/cluster/assignStorylines.ts`, exported as `assignStorylines(supabase)`):

1. Fetch candidate stories: `storyline_id is null`, `canonical_headline is not null` (need the headline to title a newly-founded storyline), ordered oldest-`created_at`-first, capped at `STORYLINE_CANDIDATE_BATCH_SIZE` (500 — mirrors the existing `ANCHOR_PAGE_SIZE` pattern in `clusterStories.ts`) per run. **Deliberately not time-windowed** by `created_at`, unlike the clustering candidate window: ~17.9k stories already have `canonical_headline` set and predate this migration, so a 48h-style window would permanently exclude all of them and the storyline layer would only ever cover coverage from tonight forward. Capping by batch size instead of by recency means the pre-existing backlog gets progressively worked through oldest-first across subsequent 2h cron ticks (~36 runs / ~3 days to clear 17.9k at 500/run) without one run trying to process the whole table at once.
2. For each candidate, if `pooled_embedding`/`entity_keys` aren't cached yet: fetch its member articles' `embedding`/`entity_keys`, compute the mean vector and key union, persist to the story row.
3. Fetch "open" storylines: stories with `storyline_id is not null` and `created_at` within `STORYLINE_WINDOW_HOURS` (240h / 10 days — matches the observed real-world span of a storyline in the diagnosed example), keeping only the most-recently-created story per `storyline_id` as that storyline's representative (its `pooled_embedding`/`entity_keys`).
4. Match rule: cosine(candidate, representative) ≥ `STORYLINE_SIM_THRESHOLD` (0.65) AND entity overlap ≥ `STORYLINE_ENTITY_MIN` (2). Looser cosine than clustering (storyline members are related-but-distinct events — an announcement vs. a follow-up detail — expected to share topic/actors more than exact wording) but a stricter entity floor (to compensate for the looser cosine bound and avoid two stories being grouped on one generic shared token like "UP"). Among all qualifying representatives, pick the highest-cosine match.
5. On match: set `candidate.storyline_id`; if the matched storyline's `title` is null, set it to the candidate's `canonical_headline`.
6. On no match: insert a new `storylines` row (`title` = candidate's `canonical_headline`), set `candidate.storyline_id` to its id.

**Open item, flagged not solved:** `STORYLINE_SIM_THRESHOLD` (0.65) and `STORYLINE_ENTITY_MIN` (2) are first-cut estimates, not diagnosed against real prod data the way the clustering threshold was (§2's diagnostic sweep). Same pattern as how 0.86 was originally chosen and later found to need adjustment — these should get the same treatment (a diagnostic sample run against real storyline-shaped data) once there's a few days of post-ship data to sample. Not a blocker for shipping, but a named follow-up.

**Wiring:** `scripts/cluster/run.ts` calls `assignStorylines(supabase)` after `fillMissingHeadlines` (needs `canonical_headline` to exist for the title), wrapped the same way `flagStoryConflicts` is — log and continue on failure, non-fatal, since it's an enhancement layered on the core pipeline and a transient failure here must not block headline generation.

## 4. Testing

- `extractEntityKeys`: numeric tokens, capitalized-word tokens, stopword filtering, punctuation handling, a Hinglish-mixed-script example.
- `clusterBySimilarity` dual-threshold logic: all four quadrants — high-threshold-only merge (no entity check needed), mid-threshold + entity-overlap merge, mid-threshold without entity overlap (no merge), entity overlap without mid-threshold cosine (no merge).
- `assignStorylines`: new storyline creation (no open match), matching into an existing open storyline (cosine + entity both pass), non-match when only one of cosine/entity passes, window-cutoff exclusion (a storyline whose latest story is older than `STORYLINE_WINDOW_HOURS` is not considered open).

## 5. Out of Scope (this spec)

- UI surfacing of storylines (fast-follow).
- Prioritizing the backlog beyond oldest-first batching (§3): if a specific known-good storyline example is needed for the demo sooner than the natural ~3-day backlog clear, that's a manual nudge (e.g. a one-off targeted run), not part of this build.
- Recomputing `pooled_embedding`/`entity_keys` when a story accrues new articles after first caching.
- Translation/multilingual NER for genuinely non-overlapping-script entity matching.
- Tuning `STORYLINE_SIM_THRESHOLD`/`STORYLINE_ENTITY_MIN` against real data (flagged in §3, deferred until post-ship data exists).
