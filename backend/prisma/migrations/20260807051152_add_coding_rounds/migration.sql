-- CreateEnum
CREATE TYPE "CodingLanguage" AS ENUM ('python', 'javascript', 'cpp', 'java');

-- CreateTable
CREATE TABLE "coding_spec" (
    "question_id" TEXT NOT NULL,
    "function_name" TEXT NOT NULL,
    "param_types" TEXT[],
    "return_type" TEXT NOT NULL,
    "starter_code" JSONB NOT NULL,

    CONSTRAINT "coding_spec_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "test_case" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "test_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_submission" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "language" "CodingLanguage" NOT NULL,
    "source_code" TEXT NOT NULL,
    "passed_count" INTEGER NOT NULL,
    "total_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_result" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "test_case_id" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "actual_output" TEXT,
    "stderr" TEXT,
    "time_ms" INTEGER,
    "memory_kb" INTEGER,

    CONSTRAINT "test_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_case_question_id_order_index_key" ON "test_case"("question_id", "order_index");

-- CreateIndex
CREATE INDEX "code_submission_user_id_question_id_idx" ON "code_submission"("user_id", "question_id");

-- CreateIndex
CREATE INDEX "test_result_submission_id_idx" ON "test_result"("submission_id");

-- AddForeignKey
ALTER TABLE "coding_spec" ADD CONSTRAINT "coding_spec_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case" ADD CONSTRAINT "test_case_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_submission" ADD CONSTRAINT "code_submission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_submission" ADD CONSTRAINT "code_submission_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_result" ADD CONSTRAINT "test_result_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "code_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_result" ADD CONSTRAINT "test_result_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
