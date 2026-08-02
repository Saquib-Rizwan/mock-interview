-- CreateEnum
CREATE TYPE "RoundType" AS ENUM ('aptitude', 'technical', 'hr', 'coding', 'group_discussion', 'managerial', 'other');

-- CreateEnum
CREATE TYPE "QuestionCategory" AS ENUM ('company_specific', 'os', 'cn', 'dbms', 'dsa', 'general_hr', 'other');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('text', 'coding');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "round_type" "RoundType" NOT NULL,
    "round_name" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" "QuestionCategory" NOT NULL,
    "expected_answer_points" TEXT[],
    "difficulty" "Difficulty" NOT NULL,
    "question_type" "QuestionType" NOT NULL,

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_question" (
    "round_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,

    CONSTRAINT "round_question_pkey" PRIMARY KEY ("round_id","question_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_name_key" ON "company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "role_company_id_name_key" ON "role"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "round_role_id_order_index_key" ON "round"("role_id", "order_index");

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round" ADD CONSTRAINT "round_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_question" ADD CONSTRAINT "round_question_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_question" ADD CONSTRAINT "round_question_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
