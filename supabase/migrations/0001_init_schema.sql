create extension if not exists pgcrypto;
create extension if not exists vector;

create table outlets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rss_url text not null unique,
  ownership jsonb,
  freedom_score numeric,
  govt_lean_score numeric,
  govt_lean_sample_size int,
  govt_lean_updated_at timestamptz,
  sensationalism_score numeric,
  is_youtube boolean not null default false,
  created_at timestamptz not null default now()
);

create table stories (
  id uuid primary key default gen_random_uuid(),
  canonical_headline text,
  summary text,
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table articles (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  title text not null,
  url text not null unique,
  snippet text,
  published_at timestamptz,
  embedding vector(768),
  story_id uuid references stories(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table outlets enable row level security;
alter table stories enable row level security;
alter table articles enable row level security;

create policy "public read outlets" on outlets for select using (true);
create policy "public read stories" on stories for select using (true);
create policy "public read articles" on articles for select using (true);
