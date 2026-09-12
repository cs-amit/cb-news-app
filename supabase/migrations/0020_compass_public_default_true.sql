-- The compass badge is supposed to be the product's public differentiator
-- (see docs/research/2026-09-11-cb-submission-draft.md Part F), but
-- compass_public defaulted to false with no UI anywhere to turn it on --
-- so no real user's badge was ever visible to anyone, including
-- themselves via the gated public_profiles view. Flip the default and
-- backfill existing real rows (demo rows are already true, this is a
-- no-op for them).
alter table profiles alter column compass_public set default true;
update profiles set compass_public = true where compass_public = false;
