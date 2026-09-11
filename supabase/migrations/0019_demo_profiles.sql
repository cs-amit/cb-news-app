-- Demo profiles for the Discover tab: a small set of seeded, removable
-- profiles (real auth users, fake handles/curated lists) so there's
-- something to browse before real users exist. `is_demo` marks exactly
-- which rows are safe to delete later (see scripts/seed/removeDemoProfiles.ts)
-- without touching any real user.
alter table profiles
  add column is_demo boolean not null default false;

-- Same security-definer pattern and reasoning as public_profiles (0006):
-- this view MUST stay a default (non-security_invoker) view so any caller
-- can browse the demo set, bypassing RLS on the underlying owner-only
-- profiles table. Only surfaces rows that are both seeded (is_demo) and
-- have explicitly opted into a public compass (compass_public) -- the demo
-- seed script sets both, but the second condition keeps this view honest
-- for any future is_demo row that doesn't.
create view discoverable_profiles as
  select id, handle, compass_position
  from profiles
  where is_demo = true and compass_public = true and handle is not null;

grant select on discoverable_profiles to anon, authenticated;
