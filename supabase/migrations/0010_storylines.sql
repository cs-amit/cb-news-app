create table storylines (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz not null default now()
);

alter table stories
  add column storyline_id uuid references storylines(id),
  add column pooled_embedding vector(768),
  add column entity_keys text[];
