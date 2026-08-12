-- Reassign existing aptitude questions out of `other`.
--
-- Split from the migration that added the enum value, deliberately: Postgres
-- will not let a newly added enum value be USED in the same transaction that
-- adds it, so `ALTER TYPE ... ADD VALUE` and this UPDATE cannot share a
-- migration.
--
-- WHY THE EXCLUSION: at the time of writing `other` held 10 rows. Nine were
-- aptitude (time and distance, work rate, profit and loss, probability, number
-- series, blood relations, calendar, permutations). One was not:
--
--   "Group discussion: Is remote work sustainable for entry-level employees?"
--
-- That one is genuinely miscellaneous and must stay in `other`, so a blanket
-- `WHERE category = 'other'` would have silently mislabelled it. `other` is
-- therefore expected to still contain exactly one row after this runs.
--
-- Two of the ten rows exist only in the database and not in data/questions/ —
-- they were ingested from files that have since changed. Updating the JSON
-- sources alone would not have moved them, which is why this runs as SQL
-- against the live table rather than relying on re-ingestion.
UPDATE "question"
SET "category" = 'aptitude'
WHERE "category" = 'other'
  AND "text" NOT ILIKE 'Group discussion:%';
