alter table profiles
  add column handle text unique,
  add column compass_position numeric,
  add column compass_public boolean not null default false,
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

create index lists_owner_id_idx on lists (owner_id);
create index list_items_list_id_position_idx on list_items (list_id, position);

-- Defense-in-depth against a duplicate default "Reposts" list (I5): the app
-- layer already guards this (completePendingHandleClaim only ever fires once,
-- gated on profiles.handle being null), but a partial unique index closes the
-- gap at the DB level too, without constraining non-default lists at all.
create unique index lists_one_default_per_owner_idx on lists (owner_id) where is_default;

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
--
-- IMPORTANT: this view MUST stay a default (non-security_invoker) view.
-- Supabase's built-in database linter will likely flag it with a
-- "security definer view" warning, but flipping `security_invoker = true`
-- in response would break it: the view's entire purpose is to let ANY
-- caller look up ANY user's public profile by handle, bypassing RLS on the
-- underlying profiles table (which is owner-only). security_invoker = true
-- would make the view respect the CALLER's own RLS instead, so a caller
-- could only ever see their own row through it — breaking "look up any
-- handle" for everyone else. Leave the linter warning unaddressed here; it
-- is a false positive for this view's purpose, same as outlet_poll_tallies.
create view public_profiles as
  select
    id,
    handle,
    case when compass_public then compass_position else null end as compass_position
  from profiles
  where handle is not null;

grant select on public_profiles to anon, authenticated;
