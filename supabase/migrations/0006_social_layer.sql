alter table profiles
  add column handle text unique,
  add column compass_position numeric,
  add column compass_public boolean not null default true,
  add column compass_quiz_taken_at timestamptz;

alter table profiles
  add constraint handle_format check (handle is null or handle ~ '^[a-z0-9_]{3,20}$');

alter table profiles
  add constraint compass_position_range
    check (compass_position is null or (compass_position >= -100 and compass_position <= 100));

create table lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  is_public boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  story_id uuid not null references stories(id) on delete cascade,
  position int not null,
  added_at timestamptz not null default now(),
  unique (list_id, story_id)
);

alter table lists enable row level security;
alter table list_items enable row level security;

create policy "owners manage own lists" on lists
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "public read public lists" on lists
  for select using (is_public = true);

create policy "owners manage own list items" on list_items
  for all using (
    exists (select 1 from lists where lists.id = list_items.list_id and lists.owner_id = auth.uid())
  ) with check (
    exists (select 1 from lists where lists.id = list_items.list_id and lists.owner_id = auth.uid())
  );

create policy "public read items of public lists" on list_items
  for select using (
    exists (select 1 from lists where lists.id = list_items.list_id and lists.is_public = true)
  );

-- Same pattern as outlet_poll_tallies (0005_polls.sql): a view exposing only
-- the fields meant to be public, bypassing RLS on the underlying (otherwise
-- fully private) profiles table. compass_position resolves to null here
-- whenever the owner has toggled compass_public off, even though the
-- underlying row still has a real value — the badge stays hidden without
-- deleting the user's own data.
create view public_profiles as
  select
    id,
    handle,
    case when compass_public then compass_position else null end as compass_position
  from profiles
  where handle is not null;

grant select on public_profiles to anon, authenticated;
