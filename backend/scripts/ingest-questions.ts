/**
 * Bulk-loads general-bank questions from a JSON file into the Question table.
 *
 *   npm run ingest --workspace backend -- ../data/questions/os.json
 *
 * Questions loaded this way are not attached to any round; use attach-questions
 * to wire them into a specific round.
 */
// Must come before the prisma import: these scripts do not go through
// src/index.ts, which is what normally loads .env.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/prisma";
import {
  Difficulty,
  QuestionCategory,
  QuestionType,
} from "../src/generated/prisma/enums";

const CATEGORIES = Object.values(QuestionCategory) as string[];
const DIFFICULTIES = Object.values(Difficulty) as string[];
const QUESTION_TYPES = Object.values(QuestionType) as string[];

type QuestionInput = {
  text: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  questionType: QuestionType;
  expectedAnswerPoints: string[];
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
  if (typeof r.questionType !== "string" || !QUESTION_TYPES.includes(r.questionType)) {
    errors.push(`${label} questionType must be one of: ${QUESTION_TYPES.join(", ")}`);
  }

  const points = r.expectedAnswerPoints;
  if (Array.isArray(points) && points.some((p) => typeof p !== "string" || !p.trim())) {
    errors.push(`${label} expectedAnswerPoints must contain only non-empty strings`);
  } else if (r.questionType === "coding") {
    // Coding questions are graded by test cases, not by the LLM against a
    // rubric, so answer points are meaningless here. Their signature and tests
    // come from ingest-coding.ts, which this script cannot express.
    if (Array.isArray(points) && points.length > 0) {
      errors.push(`${label} coding questions must not have expectedAnswerPoints`);
    }
  } else if (!Array.isArray(points) || points.length === 0) {
    // Phase 4 grades strictly against these points, so a text question without
    // them cannot be answered — better to reject at load time than to discover
    // it when a student submits.
    errors.push(`${label} expectedAnswerPoints must be a non-empty array`);
  }

  return errors;
}

async function main() {
  const [, , fileArg] = process.argv;
  if (!fileArg) {
    console.error("Usage: npm run ingest --workspace backend -- <path-to-json>");
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

  const records = parsed as QuestionInput[];

  // Duplicate detection is by exact question text. Question has no natural
  // unique key — the same wording can legitimately exist in two categories —
  // so this is enforced here rather than by a database constraint, which keeps
  // re-running the script safe without blocking deliberate near-duplicates.
  const texts = records.map((r) => r.text);
  const existing = await prisma.question.findMany({
    where: { text: { in: texts } },
    select: { text: true },
  });
  const existingTexts = new Set(existing.map((q) => q.text));

  const seenInFile = new Set<string>();
  const toInsert: QuestionInput[] = [];
  let skippedExisting = 0;
  let skippedDuplicateInFile = 0;

  for (const record of records) {
    if (existingTexts.has(record.text)) {
      skippedExisting++;
    } else if (seenInFile.has(record.text)) {
      skippedDuplicateInFile++;
    } else {
      seenInFile.add(record.text);
      toInsert.push(record);
    }
  }

  if (toInsert.length > 0) {
    await prisma.question.createMany({ data: toInsert });
  }

  console.log(`Ingested ${fileArg}`);
  console.log(`  inserted:            ${toInsert.length}`);
  console.log(`  skipped (in DB):     ${skippedExisting}`);
  console.log(`  skipped (dup in file): ${skippedDuplicateInFile}`);
  console.log(`  total in file:       ${records.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
