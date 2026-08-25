-- Three question categories the documented drives ask for and the catalogue
-- could not express: C programming, Python, and cloud fundamentals.
--
-- ONE migration and no data step, unlike 20260812130633 which had to be split.
-- That split was needed because it REASSIGNED existing rows to a newly added
-- enum value, and Postgres forbids using a value in the transaction that adds
-- it. Nothing is reassigned here: no existing question belongs in any of these,
-- so the three values are added and left unused until the next ingest run.
--
-- WHY THESE THREE AND NOT DEVOPS: the threshold used across this project is that
-- a second company has to ask for it before a category is worth having.
--   c_programming  Anora (pointers, output prediction), Abilytics (C and Java)
--   python         Armada (tuple vs dict, list insertion), Cloudium, Abilytics
--   cloud          Cloudium (IaaS/PaaS/SaaS, deployment models), Abilytics
-- DevOps is asked by Abilytics alone, so it stays an inline company-specific
-- question until a second drive asks for it.
--
-- Added BEFORE bulk MCQ authoring on purpose. Writing 150 questions into `other`
-- and migrating them afterwards is the same mistake this project already made
-- once with aptitude, and it cost two migrations and a hand-written exclusion.
ALTER TYPE "QuestionCategory" ADD VALUE 'c_programming';
ALTER TYPE "QuestionCategory" ADD VALUE 'python';
ALTER TYPE "QuestionCategory" ADD VALUE 'cloud';
