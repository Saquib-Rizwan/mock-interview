/**
 * Loads coding questions — signature, starter code and test cases — from a JSON
 * file.
 *
 *   npm run ingest:coding --workspace backend -- ../data/questions/coding-dsa.json
 *
 * Separate from ingest-questions because the shapes genuinely differ: a text
 * question is one row, a coding question is a row plus a signature plus N test
 * cases, and folding both into one script would mean a validator full of
 * "required unless questionType is coding" branches.
 *
 * Matching is by exact question text, same as ingest-questions, so this can
 * attach a signature and tests to a question that was already seeded.
 */
// Must come before the prisma import: these scripts do not go through
// src/index.ts, which is what normally loads .env.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/prisma";
import { CodingLanguage, Difficulty, QuestionCategory } from "../src/generated/prisma/enums";
import { isSupportedType, SUPPORTED_TYPES, validateTestCase } from "../src/coding/types";
import type { CodingType } from "../src/coding/types";

const CATEGORIES = Object.values(QuestionCategory) as string[];
const DIFFICULTIES = Object.values(Difficulty) as string[];
const LANGUAGES = Object.values(CodingLanguage) as string[];

type TestCaseInput = { input: string; expected: string; isSample?: boolean };

type CodingInput = {
  text: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  coding: {
    functionName: string;
    paramTypes: string[];
    returnType: string;
    starterCode: Record<string, string>;
    /**
     * Algorithmic patterns, e.g. ["sliding-window"]. Optional: the questions
     * authored before this field existed have none, and an untagged question is
     * still a perfectly good question — it just cannot be reached by "show me
     * more like this one".
     */
    patterns?: string[];
    testCases: TestCaseInput[];
  };
};

function validate(record: unknown, index: number): string[] {
  const errors: string[] = [];
  const label = `[${index}]`;

  if (typeof record !== "object" || record === null) return [`${label} is not an object`];
  const r = record as Record<string, unknown>;

  if (typeof r.text !== "string" || !r.text.trim()) {
    errors.push(`${label} text is required`);
  }
  if (typeof r.category !== "string" || !CATEGORIES.includes(r.category)) {
    errors.push(`${label} category must be one of: ${CATEGORIES.join(", ")}`);
  }
  if (typeof r.difficulty !== "string" || !DIFFICULTIES.includes(r.difficulty)) {
    errors.push(`${label} difficulty must be one of: ${DIFFICULTIES.join(", ")}`);
  }

  const coding = r.coding as Record<string, unknown> | undefined;
  if (typeof coding !== "object" || coding === null) {
    errors.push(`${label} coding block is required`);
    return errors;
  }

  if (typeof coding.functionName !== "string" || !coding.functionName.trim()) {
    errors.push(`${label} coding.functionName is required`);
  }

  const paramTypes = coding.paramTypes;
  if (!Array.isArray(paramTypes)) {
    errors.push(`${label} coding.paramTypes must be an array`);
  } else {
    paramTypes.forEach((t, i) => {
      if (typeof t !== "string" || !isSupportedType(t)) {
        errors.push(
          `${label} coding.paramTypes[${i}] "${String(t)}" is not supported. ` +
            `Supported: ${SUPPORTED_TYPES.join(", ")}`
        );
      }
    });
  }

  if (typeof coding.returnType !== "string" || !isSupportedType(coding.returnType)) {
    errors.push(
      `${label} coding.returnType "${String(coding.returnType)}" is not supported. ` +
        `Supported: ${SUPPORTED_TYPES.join(", ")}`
    );
  }

  // Every language must have starter code. A missing one is only discovered
  // when a student picks that language and gets an empty editor.
  const starter = coding.starterCode as Record<string, unknown> | undefined;
  if (typeof starter !== "object" || starter === null) {
    errors.push(`${label} coding.starterCode is required`);
  } else {
    for (const lang of LANGUAGES) {
      if (typeof starter[lang] !== "string" || !starter[lang]) {
        errors.push(`${label} coding.starterCode.${lang} is required`);
      }
    }
  }

  const tests = coding.testCases;
  if (!Array.isArray(tests) || tests.length === 0) {
    errors.push(`${label} coding.testCases must be a non-empty array`);
  } else {
    if (!tests.some((t) => (t as TestCaseInput)?.isSample)) {
      // Without a sample the student sees no worked example at all.
      errors.push(`${label} at least one test case must have isSample: true`);
    }
    tests.forEach((t, i) => {
      const tc = t as Record<string, unknown>;
      if (typeof tc?.input !== "string" || typeof tc?.expected !== "string") {
        errors.push(`${label} testCases[${i}] needs string input and expected`);
        return;
      }
      if (Array.isArray(paramTypes)) {
        const problems = validateTestCase(
          tc.input,
          tc.expected,
          paramTypes.filter(isSupportedType) as CodingType[]
        );
        problems.forEach((p) => errors.push(`${label} testCases[${i}] ${p}`));
      }
    });
  }

  return errors;
}

async function main() {
  const [, , fileArg] = process.argv;
  if (!fileArg) {
    console.error("Usage: npm run ingest:coding --workspace backend -- <path-to-json>");
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), fileArg);

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Could not read or parse ${filePath}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  if (!Array.isArray(parsed)) {
    console.error("Top level of the file must be an array.");
    process.exit(1);
  }

  // Same rule as Phase 5: validate every record before writing any of them, so
  // a typo in record 3 cannot leave records 1 and 2 half-loaded.
  const errors = parsed.flatMap((record, i) => validate(record, i));
  if (errors.length > 0) {
    console.error(`${errors.length} validation error(s) in ${fileArg}:\n`);
    errors.forEach((e) => console.error("  " + e));
    console.error("\nNothing was written.");
    process.exit(1);
  }

  const records = parsed as CodingInput[];
  let created = 0;
  let specsWritten = 0;
  let testsWritten = 0;
  let testsSkipped = 0;

  for (const record of records) {
    let question = await prisma.question.findFirst({
      where: { text: record.text },
      select: { id: true, questionType: true },
    });

    if (!question) {
      question = await prisma.question.create({
        data: {
          text: record.text,
          category: record.category,
          difficulty: record.difficulty,
          questionType: "coding",
          // Empty by design: coding questions are graded by test cases, not by
          // an LLM against a rubric.
          expectedAnswerPoints: [],
        },
        select: { id: true, questionType: true },
      });
      created++;
    } else if (question.questionType !== "coding") {
      console.error(
        `Refusing to attach a coding spec to a text question: "${record.text.slice(0, 60)}"`
      );
      process.exit(1);
    }

    await prisma.codingSpec.upsert({
      where: { questionId: question.id },
      create: {
        questionId: question.id,
        functionName: record.coding.functionName,
        paramTypes: record.coding.paramTypes,
        returnType: record.coding.returnType,
        starterCode: record.coding.starterCode,
        patterns: record.coding.patterns ?? [],
      },
      update: {
        functionName: record.coding.functionName,
        paramTypes: record.coding.paramTypes,
        returnType: record.coding.returnType,
        starterCode: record.coding.starterCode,
        patterns: record.coding.patterns ?? [],
      },
    });
    specsWritten++;

    // Test cases are written only when a question has none. Replacing them
    // would mean deleting rows that past TestResults point at, and the schema
    // deliberately restricts that — an old attempt must keep meaning what it
    // meant when it was graded.
    const existing = await prisma.testCase.count({ where: { questionId: question.id } });
    if (existing > 0) {
      testsSkipped += record.coding.testCases.length;
    } else {
      await prisma.testCase.createMany({
        data: record.coding.testCases.map((t, i) => ({
          questionId: question!.id,
          input: t.input,
          expected: t.expected,
          isSample: t.isSample ?? false,
          orderIndex: i,
        })),
      });
      testsWritten += record.coding.testCases.length;
    }
  }

  console.log(`Ingested ${fileArg}`);
  console.log(`  questions created:   ${created}`);
  console.log(`  signatures written:  ${specsWritten}`);
  console.log(`  test cases written:  ${testsWritten}`);
  if (testsSkipped > 0) {
    console.log(`  test cases skipped:  ${testsSkipped} (question already had test cases)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
