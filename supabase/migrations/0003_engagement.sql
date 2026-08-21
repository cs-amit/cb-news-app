create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  streak_count int not null default 0,
  longest_streak int not null default 0,
  sides_seen_total int not null default 0,
  notification_opt_in boolean not null default false,
  notification_hour int not null default 9,
  created_at timestamptz not null default now()
);

create table user_story_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references stories(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (user_id, story_id, outlet_id)
);

alter table profiles enable row level security;
alter table user_story_views enable row level security;

-- Unlike Weeks 1-2's public-read/service-role-write tables, these two are
-- owned entirely by the user they belong to — every policy is scoped to
-- auth.uid(), and there is no public-read policy at all.
create policy "users manage own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "users manage own views" on user_story_views
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create a profile row the instant a user (anonymous or permanent)
-- is created, so the app never has to race an insert against RLS on first
-- use, and so an anonymous-to-permanent upgrade (which keeps the same
-- auth.users.id) never orphans its existing profile row.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
