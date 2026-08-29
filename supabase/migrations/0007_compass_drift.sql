alter table profiles
  add column compass_week_started_at timestamptz,
  add column compass_week_delta numeric not null default 0;

alter table profiles
  add constraint compass_week_delta_non_negative check (compass_week_delta >= 0);
