/**
 * Draft a coding question from a LeetCode problem slug.
 *
 *   npx tsx scripts/import-leetcode.ts two-sum valid-parentheses
 *
 * WHAT THIS IS FOR: adding a coding question by hand means writing nine fields,
 * and six of them are mechanical — the function signature, the parameter types,
 * the return type, starter code for four languages, the difficulty, and the
 * algorithmic pattern. LeetCode's public GraphQL endpoint already knows all six.
 * This fetches them so the authoring effort goes into the parts that actually
 * need judgement.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 * - **It never runs at request time.** This is a dev script that writes files.
 *   The endpoint is unofficial, has no contract and can change without notice;
 *   a student running code must never depend on it being up.
 * - **It does not produce expected outputs.** LeetCode exposes sample *inputs*
 *   only — the answer key stays behind their judge. Outputs are computed by
 *   running a reference solution through `npm run expected`, which is the rule
 *   that keeps a wrong answer key from ever being committed.
 * - **It does not copy the problem statement into the shipped question.** The
 *   statement is LeetCode's copyright and this repository is public. The raw
 *   HTML is written into the draft under `_leetcodeStatementHtml` purely as
 *   reference for rewording, and the draft is refused by the ingest step until
 *   that field is gone.
 *
 * Drafts land in `data/questions/drafts/`, which is gitignored.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENDPOINT = "https://leetcode.com/graphql";
const DRAFTS_DIR = join(__dirname, "..", "..", "data", "questions", "drafts");

/** The subset of LeetCode's schema this script relies on. */
type LeetCodeQuestion = {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  difficulty: "Easy" | "Medium" | "Hard";
  /** JSON string: { name, params: [{name,type}], return: {type}, manual? } */
  metaData: string;
  /** Newline-separated literals: one line per parameter, repeated per case. */
  exampleTestcases: string;
  topicTags: { name: string; slug: string }[];
  content: string | null;
};

type MetaData = {
  name: string;
  params: { name: string; type: string }[];
  return: { type: string };
  /** True for class-based design problems (LRU Cache, Min Stack, Trie). */
  manual?: boolean;
};

/**
 * LeetCode's type names to this project's.
 *
 * Anything absent is unsupported *by the harness*, not merely unmapped — so an
 * unknown type aborts that question rather than guessing. `character` is the
 * common one: the harness has no char type, and silently importing it as
 * `string` would produce a program that compiles and returns wrong answers,
 * which is far worse than a skip.
 */
const TYPE_MAP: Record<string, string> = {
  integer: "int",
  "integer[]": "int[]",
  "integer[][]": "int[][]",
  string: "string",
  "string[]": "string[]",
  boolean: "bool",
  double: "double",
  "double[]": "double[]",
  ListNode: "ListNode",
  TreeNode: "TreeNode",
};

/** Container parameters are taken by reference in C++; returns are by value. */
const CPP_TYPE: Record<string, string> = {
  int: "int",
  "int[]": "vector<int>",
  "int[][]": "vector<vector<int>>",
  string: "string",
  "string[]": "vector<string>",
  bool: "bool",
  double: "double",
  "double[]": "vector<double>",
  ListNode: "ListNode*",
  TreeNode: "TreeNode*",
};

const JAVA_TYPE: Record<string, string> = {
  int: "int",
  "int[]": "int[]",
  "int[][]": "int[][]",
  string: "String",
  "string[]": "String[]",
  bool: "boolean",
  double: "double",
  "double[]": "double[]",
  ListNode: "ListNode",
  TreeNode: "TreeNode",
};

/** Pointer and primitive types pass by value; containers by reference. */
function cppParam(type: string): string {
  const base = CPP_TYPE[type];
  return base.startsWith("vector") ? `${base}&` : base;
}

async function fetchQuestion(slug: string): Promise<LeetCodeQuestion> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Omitting a browser-ish agent gets the request rejected.
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({
      query: `query q($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          questionFrontendId title titleSlug difficulty
          metaData exampleTestcases
          topicTags { name slug }
          content
        }
      }`,
      variables: { titleSlug: slug },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} fetching "${slug}"`);
  const body = (await res.json()) as { data?: { question: LeetCodeQuestion | null } };
  const question = body.data?.question;
  if (!question) throw new Error(`No such problem: "${slug}"`);
  return question;
}

function starterCode(meta: MetaData, params: string[], returnType: string) {
  const names = meta.params.map((p) => p.name);

  const cppArgs = params.map((t, i) => `${cppParam(t)} ${names[i]}`).join(", ");
  const javaArgs = params.map((t, i) => `${JAVA_TYPE[t]} ${names[i]}`).join(", ");
  const plainArgs = names.join(", ");

  return {
    python: `def ${meta.name}(${plainArgs}):\n    pass\n`,
    javascript: `function ${meta.name}(${plainArgs}) {\n\n}\n`,
    cpp: `${CPP_TYPE[returnType]} ${meta.name}(${cppArgs}) {\n\n}\n`,
    java: `public ${JAVA_TYPE[returnType]} ${meta.name}(${javaArgs}) {\n\n}\n`,
  };
}

/**
 * LeetCode lists example values one per line, cycling through the parameters.
 * A two-parameter problem with three examples is six lines. This regroups them
 * into the project's format: a JSON array of the arguments, as a string.
 */
function sampleInputs(raw: string, paramCount: number): string[] {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const cases: string[] = [];

  for (let i = 0; i + paramCount <= lines.length; i += paramCount) {
    const args = lines.slice(i, i + paramCount).map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        // Rare non-JSON literal; keep the raw text so it is visibly wrong in
        // the draft rather than silently dropped.
        return line;
      }
    });
    cases.push(JSON.stringify(args));
  }
  return cases;
}

async function importOne(slug: string) {
  const q = await fetchQuestion(slug);
  const meta = JSON.parse(q.metaData) as MetaData;

  if (meta.manual) {
    console.error(
      `SKIP ${slug}: class-based design problem. The harness runs a single ` +
        `function; a class-based harness does not exist yet.`
    );
    return null;
  }

  const paramTypes = meta.params.map((p) => TYPE_MAP[p.type]);
  const returnType = TYPE_MAP[meta.return.type];
  const unknown = meta.params
    .map((p) => p.type)
    .concat(meta.return.type)
    .filter((t) => !TYPE_MAP[t]);

  if (unknown.length > 0) {
    console.error(
      `SKIP ${slug}: unsupported type(s) ${[...new Set(unknown)].join(", ")}. ` +
        `Importing these would produce a harness that compiles and returns ` +
        `wrong answers.`
    );
    return null;
  }

  const draft = {
    // Placeholder on purpose: this must be reworded before the question ships.
    text: `TODO reword in your own words — see _leetcodeStatementHtml. (${q.title})`,
    category: "dsa",
    difficulty: q.difficulty.toLowerCase(),
    coding: {
      functionName: meta.name,
      paramTypes,
      returnType,
      // Generated from metaData rather than lifted from LeetCode's snippets:
      // theirs wrap the function in a Solution class, and this harness calls a
      // bare function.
      starterCode: starterCode(meta, paramTypes, returnType),
      patterns: q.topicTags.map((t) => t.slug),
      testCases: sampleInputs(q.exampleTestcases, meta.params.length).map((input) => ({
        input,
        // Computed by `npm run expected` once a reference solution exists.
        expected: "",
        isSample: true,
      })),
    },
    _leetcodeSlug: q.titleSlug,
    _leetcodeId: q.questionFrontendId,
    _leetcodeStatementHtml: q.content,
    _todo: [
      "Reword `text` in your own words, then delete _leetcodeStatementHtml",
      "Add hidden test cases (isSample: false), including edge cases",
      "Write a Python reference solution in the drafts folder",
      "Run `npm run expected` to compute every `expected` value",
    ],
  };

  mkdirSync(DRAFTS_DIR, { recursive: true });
  const outPath = join(DRAFTS_DIR, `leetcode-${slug}.json`);
  writeFileSync(outPath, JSON.stringify([draft], null, 2) + "\n");

  console.log(
    `OK   ${slug}  ${meta.name}(${paramTypes.join(", ")}) -> ${returnType}  ` +
      `[${draft.coding.patterns.join(", ")}]  ` +
      `${draft.coding.testCases.length} sample case(s)`
  );
  return outPath;
}

async function main() {
  const slugs = process.argv.slice(2);
  if (slugs.length === 0) {
    console.error("Usage: npx tsx scripts/import-leetcode.ts <slug> [<slug>...]");
    console.error("The slug is the last part of the problem URL, e.g. two-sum");
    process.exit(1);
  }

  let written = 0;
  for (const slug of slugs) {
    try {
      if (await importOne(slug)) written++;
    } catch (err) {
      console.error(`FAIL ${slug}: ${err instanceof Error ? err.message : err}`);
    }
    // The endpoint is unofficial and unmetered; pace the requests rather than
    // find out what its rate limit is.
    if (slugs.length > 1) await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n${written} of ${slugs.length} drafted into data/questions/drafts/`);
}

void main();
