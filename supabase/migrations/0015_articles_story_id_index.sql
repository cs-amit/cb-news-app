-- The Compare/Single-source feed split counts articles per story via a
-- PostgREST embedded aggregate (articles!story_id(count)), which runs one
-- correlated lookup per story. Without an index this was a sequential scan
-- of the whole articles table per story, timing out once it grew past ~50k
-- rows.
create index articles_story_id_idx on articles(story_id);
