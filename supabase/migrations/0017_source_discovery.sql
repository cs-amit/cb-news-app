-- Sub-project 5: actively search for more sources on popular-but-single-source
-- stories. See docs/superpowers/specs/2026-09-07-source-discovery-design.md.

alter table stories add column source_discovery_checked_at timestamptz;

-- Discovered articles are deliberately NOT stored in the main `articles`
-- table and their outlets are NOT added to `outlets`. Those carry vetted
-- ownership/bias/freedom scores (manually researched, or LLM-scored from a
-- real sample); a source surfaced once by a keyword search has neither, and
-- treating it as a peer of the curated 53 would misrepresent it as vetted.
create table discovered_articles (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  outlet_name text not null,
  url text not null unique,
  title text not null,
  published_at timestamptz,
  -- Cosine similarity against the story's founder-article embedding that
  -- admitted this candidate (>= SIMILARITY_THRESHOLD_HIGH) -- kept for
  -- transparency/debugging, not shown to end users.
  similarity numeric not null,
  discovered_at timestamptz not null default now()
);

alter table discovered_articles enable row level security;

create policy "public read discovered_articles" on discovered_articles for select using (true);
