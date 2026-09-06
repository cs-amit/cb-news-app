-- The feed's Compare/Single-source split needs each story's source count.
-- A PostgREST embedded aggregate (articles!story_id(count)) was tried first
-- but compiles to a GROUP BY over the entire articles table (52k+ rows) on
-- every feed load -- 1.4s+ and prone to breaching the anon role's 3s
-- statement_timeout. A denormalized counter, kept in sync by a trigger on
-- articles, makes the read O(1) instead.
alter table stories add column article_count integer not null default 0;

update stories s
set article_count = agg.cnt
from (
  select story_id, count(*) as cnt
  from articles
  where story_id is not null
  group by story_id
) agg
where agg.story_id = s.id;

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
$$ language plpgsql;

create trigger articles_bump_story_count
after insert or update of story_id or delete on articles
for each row execute function bump_story_article_count();
