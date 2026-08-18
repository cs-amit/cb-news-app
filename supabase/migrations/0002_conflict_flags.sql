create table story_conflict_flags (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  matched_entity text not null,
  evidence_text text not null,
  created_at timestamptz not null default now(),
  unique (story_id, outlet_id, matched_entity)
);

alter table story_conflict_flags enable row level security;

create policy "public read story_conflict_flags" on story_conflict_flags for select using (true);
