alter table profiles
  add column compass_week_started_at timestamptz,
  add column compass_week_delta numeric not null default 0;
