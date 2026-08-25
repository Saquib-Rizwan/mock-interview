-- Eligibility criteria on a role, as stated by the placement material.
--
-- ONE migration, not two: unlike 20260812130633, nothing here adds an enum
-- value, so there is no Postgres restriction on using a new value in the same
-- transaction that creates it. Three plain column adds, all with defaults or
-- nullable, so existing rows need no backfill and the change is non-breaking.
--
-- WHY THREE COLUMNS AND NOT ONE: eligibility has three states, not two.
--
--   eligible_branches = '{}'  AND open_to_all_branches = false
--       -> the source document said nothing. Unknown.
--   open_to_all_branches = true
--       -> the source explicitly said "All Branches".
--   eligible_branches = '{CS,EC,EEE}'
--       -> the source listed specific branches.
--
-- The first two must stay distinguishable. Ten of the sixteen companies in
-- data/catalog.json predate the placement material and have no stated
-- eligibility at all; showing those as "open to all" would invent a fact, which
-- is the one thing this catalogue is not allowed to do.
--
-- min_cgpa is nullable for the same reason: NULL means the document did not
-- state a cutoff, never that there is no cutoff.
ALTER TABLE "role"
  ADD COLUMN "eligible_branches"     TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN "open_to_all_branches"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "min_cgpa"              DOUBLE PRECISION;
