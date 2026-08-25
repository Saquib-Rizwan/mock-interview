-- Phase 10 — MCQ assessment rounds.
--
-- ONE migration despite adding an enum value, unlike the two-part split at
-- 20260812130633. The Postgres restriction is on USING a newly added enum value
-- in the transaction that adds it, not on adding it. Nothing here writes 'mcq'
-- to a row: the tables below are created empty and questions are labelled by a
-- later ingest run. Postgres 16, so ALTER TYPE ... ADD VALUE inside a
-- transaction is permitted at all.
ALTER TYPE "QuestionType" ADD VALUE 'mcq';

-- The answer key, deliberately in its own table.
--
-- Same defence as CodingSpec and hidden TestCase rows: `correct_index` and
-- `solution` are absent from every query that does not name this table, so a
-- leak requires someone to actively join rather than merely to forget an
-- exclusion. For a mock test whose whole value is not knowing the answer, that
-- distinction is the feature.
CREATE TABLE "mcq_spec" (
    "question_id"   TEXT NOT NULL,
    "options"       TEXT[],
    "correct_index" INTEGER NOT NULL,
    "solution"      TEXT NOT NULL,
    CONSTRAINT "mcq_spec_pkey" PRIMARY KEY ("question_id")
);

-- A round that is a timed test rather than a conversation. The EXISTENCE of
-- this row is what makes a round an assessment round; there is deliberately no
-- `round_mode` column that could disagree with it.
--
-- negative_marking is per-assessment because the two documented drives differ:
-- Abilytics deducts for wrong answers, Anora is single mark each. A global
-- constant would have been wrong for one of them on day one.
CREATE TABLE "assessment" (
    "id"                 TEXT NOT NULL,
    "round_id"           TEXT NOT NULL,
    "total_duration_min" INTEGER,
    "negative_marking"   DOUBLE PRECISION,
    "can_revisit"        BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "assessment_pkey" PRIMARY KEY ("id")
);

-- Sections exist as a table, not columns, because Anora runs three consecutive
-- ones at 75/30/15 minutes while Abilytics runs a single undivided paper. A
-- flat set of columns could not hold both.
CREATE TABLE "assessment_section" (
    "id"                 TEXT NOT NULL,
    "assessment_id"      TEXT NOT NULL,
    "order_index"        INTEGER NOT NULL,
    "name"               TEXT NOT NULL,
    "duration_min"       INTEGER,
    "marks_per_question" DOUBLE PRECISION NOT NULL DEFAULT 1,
    CONSTRAINT "assessment_section_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_question" (
    "section_id"  TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    CONSTRAINT "assessment_question_pkey" PRIMARY KEY ("section_id","question_id")
);

-- One sitting. The session concept the phase turned on: a mock test is scored
-- as a whole once submitted, so selections must live somewhere until then.
--
-- submitted_at and the scoring columns are nullable together, which is what
-- keeps an abandoned attempt distinguishable from one that genuinely scored 0.
CREATE TABLE "assessment_attempt" (
    "id"               TEXT NOT NULL,
    "user_id"          TEXT NOT NULL,
    "assessment_id"    TEXT NOT NULL,
    "started_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at"     TIMESTAMP(3),
    "answers"          JSONB NOT NULL DEFAULT '{}',
    "score"            DOUBLE PRECISION,
    "max_score"        DOUBLE PRECISION,
    "correct_count"    INTEGER,
    "wrong_count"      INTEGER,
    "unanswered_count" INTEGER,
    CONSTRAINT "assessment_attempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_round_id_key" ON "assessment"("round_id");
CREATE UNIQUE INDEX "assessment_section_assessment_id_order_index_key" ON "assessment_section"("assessment_id","order_index");
CREATE UNIQUE INDEX "assessment_question_section_id_order_index_key" ON "assessment_question"("section_id","order_index");
CREATE INDEX "assessment_attempt_user_id_assessment_id_idx" ON "assessment_attempt"("user_id","assessment_id");

ALTER TABLE "mcq_spec" ADD CONSTRAINT "mcq_spec_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_round_id_fkey"
    FOREIGN KEY ("round_id") REFERENCES "round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_section" ADD CONSTRAINT "assessment_section_assessment_id_fkey"
    FOREIGN KEY ("assessment_id") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_question" ADD CONSTRAINT "assessment_question_section_id_fkey"
    FOREIGN KEY ("section_id") REFERENCES "assessment_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Restrict, matching round_question: pool questions are shared, so removing a
-- section must never delete the question itself.
ALTER TABLE "assessment_question" ADD CONSTRAINT "assessment_question_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_attempt" ADD CONSTRAINT "assessment_attempt_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_attempt" ADD CONSTRAINT "assessment_attempt_assessment_id_fkey"
    FOREIGN KEY ("assessment_id") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
