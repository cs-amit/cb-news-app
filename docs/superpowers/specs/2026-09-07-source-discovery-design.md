# Source discovery for popular single-source stories (sub-project 5)

**Status:** Approved for implementation (design walked through interactively with the user; user then stepped away with "keep working" — implementation proceeds under that authorization)
**Date:** 2026-09-07
**Context:** Part of the larger 6-part UI/feature overhaul (see `sourced_ui_overhaul_status.md` memory). Sub-projects 1-3 already shipped (visual foundation, compass badge rework, Compare/Single-source feed split). This is #5: rather than passively waiting for the fixed ~53-outlet RSS list to happen to cover a story with 2+ outlets, actively search for more sources on stories that have sat single-source for a while.

## 1. Problem

The feed's Compare tab (shipped in sub-project 3) only shows stories with 2+ curated sources. Many stories never get there — RSS ingestion is a fixed, curated outlet list, so a story one outlet covered may simply never get picked up by a second one in that list, even if plenty of other coverage exists elsewhere on the web.

## 2. Trigger & eligibility

A story becomes eligible for a discovery lookup when **all** of:
- `canonical_headline is not null` (headline generation has run)
- `article_count = 1` (still single-source, per the sub-project 3 counter)
- `first_seen_at` is 6+ hours old (gives RSS ingestion a real chance first — this is deliberately time-only, not engagement-weighted; the user chose "time only, no engagement signal" over wiring up view-counts as a trigger)
- `source_discovery_checked_at is null` (never looked before)

Each run stamps `source_discovery_checked_at` on every story it actually queried the API for — regardless of whether any result passed the similarity bar — so no story is ever queried twice. A story can still separately, organically pick up a second RSS source later and move to Compare on its own; discovery only ever adds supplementary material, it never blocks that path.

## 3. Search & relevance matching

For each eligible story (capped at `MAX_LOOKUPS_PER_RUN = 15` per run — see budget section), call NewsData.io's `/latest` endpoint with `q=<canonical_headline>`, `country=in`, `language=en`. One credit per story checked; returns up to 10 candidate articles.

Keyword search alone is noisy — not every result is actually about the same event. Each candidate's title is embedded via the existing `embedText()` (same Gemini embedding call already used for clustering, no new cost) and compared by cosine similarity against **the story's founder article's embedding** (`stories.founder_article_id → articles.embedding`, an already-established column from migration 0012). Only candidates scoring **>= `SIMILARITY_THRESHOLD_HIGH` (0.86)** are kept — reusing the existing clustering threshold from `scripts/cluster/similarity.ts` rather than inventing a new one, since that's already the bar this codebase trusts for "direct topical match, no ambiguity."

## 4. Data model

Discovered articles are **not** stored in the main `articles`/`outlets` tables. Those carry vetted ownership/bias/freedom scores — ownership is manually researched by the user (RSF Media Ownership Monitor, Wikipedia, MCA filings), and govt-lean/sensationalism scores come from an LLM batch job that needs a real sample (~15-20 articles) per outlet to be credible. A source surfaced once by a keyword search has neither. Treating it as a peer of the curated 53 (even with null scores) would misrepresent it as vetted, undermining the app's whole "vetted transparency" premise.

Instead: a new table, `discovered_articles` (migration 0017):

```sql
discovered_articles(
  id uuid pk,
  story_id uuid references stories(id) on delete cascade,
  outlet_name text not null,
  url text not null unique,       -- upsert key; a re-run never duplicates
  title text not null,
  published_at timestamptz,
  similarity numeric not null,    -- the admitting cosine score, kept for debugging
  discovered_at timestamptz not null default now()
)
```

RLS: public read (`using (true)`), matching every other content table. Writes happen via the service-role key in the cron script, which bypasses RLS anyway.

**Explicitly decided:** discovered sources do **not** count toward the Compare tab's 2+ source threshold (`stories.article_count`, maintained by the migration-0016 trigger on `articles` only). The user's original goal was to help stories qualify for comparison, but on reflection chose to keep Compare strictly about vetted outlets — discovered sources show as a supplementary "also found via search" section on the story page regardless of which feed tab the story lives in.

## 5. Quota & scheduling

Existing scheduled jobs (`ingest`, `cluster`, `score`, `factcheck`) run via GitHub Actions cron calling `npm run <job>`, not Supabase Edge Functions (the original product-design doc said Edge Functions; the actual implementation uses GH Actions — this spec follows what's actually deployed). This job follows the same pattern: a new `discover` script, its own workflow file, on a **6-hour cron** (`0 */6 * * *`).

Rate-limiting follows the codebase's established convention (`scripts/summarize/fillMissingHeadlines.ts`'s `MAX_REQUESTS_PER_RUN`): a simple in-run cap, not a persisted daily-usage counter. At `MAX_LOOKUPS_PER_RUN = 15` and 4 runs/day, that's **60 NewsData.io calls/day max** — comfortably under the 200 credits/day free tier, with real headroom for growth.

**Known limitation:** NewsData.io's free tier has a 12-hour data delay, so a story that just crossed the 6-hour eligibility mark may not yet have very recent (last few hours) coverage indexed. Acceptable for "already sitting single-source for a while," not built for breaking-news speed.

**Cost:** NewsData.io free tier — $0, no credit-card-triggered billing risk (exceeding the daily credit cap requires actively buying add-on credits or upgrading; it does not auto-charge). It's the only evaluated option (vs. GNews, NewsAPI.org, Google Custom Search, Bing News Search) whose free tier is both keyword-searchable and explicitly licensed for a shipped/production app, and has real India-specific coverage (`country=in`, Indian-language sources).

## 6. Merge integration

`scripts/cluster/mergeStories.ts` already reassigns dependent rows (via dedupe-aware and direct reassignment) when a bridge-detected merge picks a survivor story. `discovered_articles` needs the same treatment as `fact_checks`/`articles` — a direct reassignment (`update discovered_articles set story_id = winner where story_id in (losers)`), no dedupe needed since `url` is already globally unique.

## 7. UI

Story page (`app/story/[id].tsx`) gets a new section, visually and structurally distinct from the vetted "Sources" list: **"Also found via search"** — outlet name + title + link only, no scores, no ownership line, marked with a distinct icon so it reads as supplementary rather than a peer source. Rendered only when `discovered_articles` has rows for the story (fail-soft: a fetch failure here must not block the rest of the page, matching the existing pattern for conflict flags / silent outlets / fact-checks).

## 8. Recurring-source signal (manual, out of scope for automation)

If the same outlet keeps showing up across many stories' `discovered_articles` over time, that's a signal worth the user manually curating it into the real `outlets` table (with real ownership research and enough of a sample for scoring) — but deciding that is the user's call, not something this feature automates. A small manual report script (`scripts/discover/reportRecurringSources.ts`) that groups `discovered_articles` by `outlet_name` and surfaces ones appearing often is enough; no UI, no automatic promotion.

## 9. What this spec does NOT cover (manual step required)

Getting a real NewsData.io API key requires signing up for a third-party account — something only the user can do (the assistant has no path to create external accounts on the user's behalf). Implementation ships fully coded and tested against a mocked API client; the one remaining manual step is: sign up at newsdata.io, get an API key, add it as `NEWSDATA_API_KEY` in `.env` (local) and as a GitHub Actions secret (for the scheduled job), same as the existing `GEMINI_API_KEY` pattern.
