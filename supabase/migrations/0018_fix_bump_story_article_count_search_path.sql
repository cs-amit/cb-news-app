-- Supabase security advisor flagged bump_story_article_count (migration 0016)
-- with a mutable search_path -- a trigger function without a locked-down
-- search_path can be hijacked by a session-level search_path change to
-- resolve "stories" against a different schema than intended. Pin it to
-- public, no functional change.
create or replace function bump_story_article_count() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.story_id is not null then
      update stories set article_count = article_count + 1 where id = new.story_id;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.story_id is distinct from old.story_id then
      if old.story_id is not null then
        update stories set article_count = article_count - 1 where id = old.story_id;
      end if;
      if new.story_id is not null then
        update stories set article_count = article_count + 1 where id = new.story_id;
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.story_id is not null then
      update stories set article_count = article_count - 1 where id = old.story_id;
    end if;
    return old;
  end if;
  return null;
end;
$$ language plpgsql set search_path = public;
