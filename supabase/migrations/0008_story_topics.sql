alter table stories
  add column topic text
    check (topic is null or topic in ('politics', 'business', 'science-tech', 'sports', 'entertainment', 'other'));
