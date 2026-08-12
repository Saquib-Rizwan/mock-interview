-- AlterEnum
ALTER TYPE "QuestionCategory" ADD VALUE 'aptitude';

-- AlterTable
ALTER TABLE "coding_spec" ADD COLUMN     "patterns" TEXT[] DEFAULT ARRAY[]::TEXT[];
