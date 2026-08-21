create table outlet_poll_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references stories(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  response text not null check (response in ('critical', 'balanced', 'friendly')),
  created_at timestamptz not null default now(),
  unique (user_id, story_id, outlet_id)
);

alter table outlet_poll_responses enable row level security;

create policy "users insert own poll response" on outlet_poll_responses
  for insert with check (auth.uid() = user_id);

create policy "users update own poll response" on outlet_poll_responses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Aggregated counts only, no user_id exposed — safe to read publicly even
-- though the underlying table's RLS restricts each row to its own user.
create view outlet_poll_tallies as
  select story_id, outlet_id, response, count(*) as response_count
  from outlet_poll_responses
  group by story_id, outlet_id, response;

grant select on outlet_poll_tallies to anon, authenticated;
