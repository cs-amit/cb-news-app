alter table stories
  add column founder_article_id uuid references articles(id);

-- Backfill: each existing story's earliest-ingested article is a faithful
-- stand-in for its true founder. Story creation already requires all seed
-- articles to mutually match at merge time, so the earliest one reflects the
-- original topic even for stories that later drifted.
update stories s
set founder_article_id = earliest.article_id
from (
  select distinct on (story_id) story_id, id as article_id
  from articles
  where story_id is not null
  order by story_id, created_at asc, id asc
) as earliest
where s.id = earliest.story_id
  and s.founder_article_id is null;
