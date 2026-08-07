/**
 * Prints the exact program that would be sent to Judge0 for a question.
 *
 *   npm run harness --workspace backend -- --question twoSum --language python
 *   npm run harness --workspace backend -- --question reverse --language javascript --solution sol.js
 *
 * The generated source is the hardest part of Phase 6 to debug: a mistake in it
 * shows up as a wrong answer or a compile error attributed to the student. Being
 * able to see the program — and pipe it straight into `node` or `python` — turns
 * that into an ordinary bug hunt.
 *
 * --question matches on a substring of the question text or its exact id.
 * --solution injects a file's contents as the student's code; without it, the
 * question's starter code is used.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/prisma";
import { CodingLanguage } from "../src/generated/prisma/enums";
import { buildSource } from "../src/coding/harness";
import { isSupportedType } from "../src/coding/types";
import type { CodingType } from "../src/coding/types";

const LANGUAGES = Object.values(CodingLanguage) as string[];

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[argv[i].slice(2)] = next;
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const needle = args.question;
  const language = args.language;

  if (!needle || !language || !LANGUAGES.includes(language)) {
    console.error(
      "Usage: --question <id or text substring> --language <" +
        LANGUAGES.join("|") +
        "> [--solution <file>]"
    );
    process.exit(1);
  }

  const question = await prisma.question.findFirst({
    where: {
      questionType: "coding",
      OR: [{ id: needle }, { text: { contains: needle, mode: "insensitive" } }],
    },
    select: {
      id: true,
      text: true,
      codingSpec: true,
      testCases: { orderBy: { orderIndex: "asc" } },
    },
  });

  if (!question) {
    console.error(`No coding question matched "${needle}"`);
    process.exit(1);
  }
  if (!question.codingSpec) {
    console.error(`"${question.text.slice(0, 60)}" has no coding spec`);
    process.exit(1);
  }

  const paramTypes = question.codingSpec.paramTypes.filter(isSupportedType) as CodingType[];
  if (!isSupportedType(question.codingSpec.returnType)) {
    console.error(`Unsupported return type: ${question.codingSpec.returnType}`);
    process.exit(1);
  }

  const starter = question.codingSpec.starterCode as Record<string, string>;
  const studentCode = args.solution
    ? readFileSync(resolve(process.cwd(), args.solution), "utf8")
    : (starter[language] ?? "");

  const inputs = question.testCases.map((t) => JSON.parse(t.input) as unknown[]);

  // Everything except the program goes to stderr, so stdout can be piped
  // directly into an interpreter.
  console.error(`# ${question.text.slice(0, 70)}`);
  console.error(`# ${question.testCases.length} test case(s), language: ${language}\n`);

  process.stdout.write(
    buildSource(
      language as CodingLanguage,
      {
        functionName: question.codingSpec.functionName,
        paramTypes,
        returnType: question.codingSpec.returnType,
      },
      studentCode,
      inputs
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
