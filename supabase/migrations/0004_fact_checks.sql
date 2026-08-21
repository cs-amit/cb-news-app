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
