/**
 * Bulk-loads multiple-choice questions and their answer keys.
 *
 *   npm run ingest:mcq --workspace backend -- ../data/questions/mcq-os-1.json
 *
 * Separate from ingest-questions.ts for the same reason ingest-coding.ts is:
 * an MCQ needs options, a correct index and a worked solution, and folding
 * those into the general loader would fill it with "required unless
 * questionType is mcq" branches.
 *
 * Question and McqSpec are written in one transaction, because a question with
 * questionType = mcq and no McqSpec cannot be presented at all — a half-written
 * pair is worse than nothing.
 */
// Must come before the prisma import: these scripts do not go through
// src/index.ts, which is what normally loads .env.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/prisma";
import { Difficulty, QuestionCategory } from "../src/generated/prisma/enums";

const CATEGORIES = Object.values(QuestionCategory) as string[];
const DIFFICULTIES = Object.values(Difficulty) as string[];

type McqInput = {
  text: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  options: string[];
  correctIndex: number;
  solution: string;
};

/** Returns a list of problems; empty means the record is valid. */
function validate(record: unknown, index: number): string[] {
  const errors: string[] = [];
  const label = `[${index}]`;

  if (typeof record !== "object" || record === null) {
    return [`${label} is not an object`];
  }
  const r = record as Record<string, unknown>;

  if (typeof r.text !== "string" || !r.text.trim()) {
    errors.push(`${label} text is required and must be a non-empty string`);
  }
  if (typeof r.category !== "string" || !CATEGORIES.includes(r.category)) {
    errors.push(`${label} category must be one of: ${CATEGORIES.join(", ")}`);
  }
  if (typeof r.difficulty !== "string" || !DIFFICULTIES.includes(r.difficulty)) {
    errors.push(`${label} difficulty must be one of: ${DIFFICULTIES.join(", ")}`);
  }

  const options = r.options;
  if (!Array.isArray(options) || options.length < 2) {
    errors.push(`${label} options must be an array of at least 2 choices`);
  } else if (options.some((o) => typeof o !== "string" || !o.trim())) {
    errors.push(`${label} options must contain only non-empty strings`);
  } else if (new Set(options as string[]).size !== options.length) {
    // Two identical options make the question unanswerable rather than merely
    // untidy: whichever is picked, the grader cannot say the choice was wrong.
    errors.push(`${label} options must all be distinct`);
  }

  // The single most damaging defect this file can carry is a wrong answer key,
  // so the index is bounds-checked against the options actually supplied.
  const ci = r.correctIndex;
  if (typeof ci !== "number" || !Number.isInteger(ci)) {
    errors.push(`${label} correctIndex must be an integer`);
  } else if (Array.isArray(options) && (ci < 0 || ci >= options.length)) {
    errors.push(
      `${label} correctIndex ${ci} is out of range for ${options.length} options`
    );
  }

  if (typeof r.solution !== "string" || !r.solution.trim()) {
    // Grading after the whole test is only useful if the review can explain
    // why, so a question with no worked solution is rejected at load time.
    errors.push(`${label} solution is required and must be a non-empty string`);
  }

  if ("expectedAnswerPoints" in r) {
    errors.push(
      `${label} must not have expectedAnswerPoints — an MCQ is graded against ` +
        `correctIndex, not by the LLM against a rubric`
    );
  }

  return errors;
}

async function main() {
  const [, , fileArg] = process.argv;
  if (!fileArg) {
    console.error("Usage: npm run ingest:mcq --workspace backend -- <path-to-json>");
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), fileArg);

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    console.error(`Could not read file: ${filePath}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`File is not valid JSON: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  if (!Array.isArray(parsed)) {
    console.error("Top level of the file must be an array of question objects.");
    process.exit(1);
  }

  // Validate everything before writing anything, so a bad file cannot leave the
  // database half-loaded.
  const errors = parsed.flatMap((record, i) => validate(record, i));
  if (errors.length > 0) {
    console.error(`${errors.length} validation error(s) in ${fileArg}:\n`);
    errors.forEach((e) => console.error("  " + e));
    console.error("\nNothing was inserted.");
    process.exit(1);
  }

  const records = parsed as McqInput[];

  // Duplicate detection by exact question text, matching ingest-questions.ts,
  // which is what keeps re-running the script safe.
  const existing = await prisma.question.findMany({
    where: { text: { in: records.map((r) => r.text) } },
    select: { text: true },
  });
  const existingTexts = new Set(existing.map((q) => q.text));

  const seenInFile = new Set<string>();
  let created = 0;
  let skippedExisting = 0;
  let skippedDuplicateInFile = 0;

  for (const record of records) {
    if (existingTexts.has(record.text)) {
      skippedExisting++;
      continue;
    }
    if (seenInFile.has(record.text)) {
      skippedDuplicateInFile++;
      continue;
    }
    seenInFile.add(record.text);

    await prisma.question.create({
      data: {
        text: record.text,
        category: record.category,
        difficulty: record.difficulty,
        questionType: "mcq",
        // Empty by design: an MCQ is graded against its recorded option, never
        // by the LLM against a rubric.
        expectedAnswerPoints: [],
        mcqSpec: {
          create: {
            options: record.options,
            correctIndex: record.correctIndex,
            solution: record.solution,
          },
        },
      },
    });
    created++;
  }

  console.log(
    `created ${created}, skipped ${skippedExisting} (already in DB), ` +
      `skipped ${skippedDuplicateInFile} (duplicate in file)`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
