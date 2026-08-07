/**
 * Turns a *draft* coding-question file into a real one by computing the
 * expected output of every test case, rather than having a human write it.
 *
 *   npm run expected --workspace backend -- ../data/questions/drafts/arrays.json
 *
 * A draft supplies a Python `referenceSolution` and a list of `testInputs` with
 * no expected values. This script builds the ordinary Python harness around the
 * reference solution, runs it locally, and writes each result back as the
 * test case's `expected`.
 *
 * Why bother: at the scale this question bank is heading for, hand-written
 * expected values would contain mistakes — and a wrong expected value is the
 * worst bug in a practice platform, because it fails a student who was right.
 * Computing them means the only thing that can be wrong is the reference
 * solution, which is a single, reviewable, runnable artefact per question.
 *
 * Keep reference solutions to conservative Python: Judge0 runs 3.8.1, so no
 * match statements and no 3.9+ standard library additions.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildSource, parseHarnessOutput } from "../src/coding/harness";
import { isSupportedType } from "../src/coding/types";
import type { CodingType } from "../src/coding/types";

type DraftTest = { input: string; isSample?: boolean };

type Draft = {
  text: string;
  category: string;
  difficulty: string;
  coding: {
    functionName: string;
    paramTypes: string[];
    returnType: string;
    starterCode: Record<string, string>;
    referenceSolution: string;
    testInputs: DraftTest[];
  };
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function main() {
  const [, , fileArg] = process.argv;
  if (!fileArg) fail("Usage: npm run expected --workspace backend -- <draft.json>");

  const filePath = resolve(process.cwd(), fileArg);
  const drafts = JSON.parse(readFileSync(filePath, "utf8")) as Draft[];
  if (!Array.isArray(drafts)) fail("Top level of the draft file must be an array.");

  const workDir = mkdtempSync(join(tmpdir(), "mi-expected-"));
  const out: unknown[] = [];
  let totalCases = 0;

  drafts.forEach((draft, index) => {
    const label = `[${index}] ${draft.text.slice(0, 55)}`;
    const spec = draft.coding;

    if (!spec?.referenceSolution) fail(`${label}: missing referenceSolution`);
    if (!Array.isArray(spec.testInputs) || spec.testInputs.length === 0) {
      fail(`${label}: missing testInputs`);
    }

    const paramTypes = spec.paramTypes.filter(isSupportedType) as CodingType[];
    if (paramTypes.length !== spec.paramTypes.length) {
      fail(`${label}: unsupported parameter type in ${spec.paramTypes.join(", ")}`);
    }
    if (!isSupportedType(spec.returnType)) {
      fail(`${label}: unsupported return type ${spec.returnType}`);
    }

    const inputs = spec.testInputs.map((t, i) => {
      try {
        const args = JSON.parse(t.input) as unknown[];
        if (!Array.isArray(args)) throw new Error("not an array");
        if (args.length !== paramTypes.length) {
          fail(
            `${label}: testInputs[${i}] has ${args.length} argument(s), signature expects ${paramTypes.length}`
          );
        }
        return args;
      } catch (err) {
        return fail(`${label}: testInputs[${i}] is not a valid JSON argument array (${err})`);
      }
    });

    const program = buildSource(
      "python",
      { functionName: spec.functionName, paramTypes, returnType: spec.returnType },
      spec.referenceSolution,
      inputs
    );

    const programPath = join(workDir, `q${index}.py`);
    writeFileSync(programPath, program, "utf8");

    let stdout: string;
    try {
      stdout = execFileSync("python", [programPath], {
        encoding: "utf8",
        timeout: 30_000,
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      fail(
        `${label}: reference solution failed to run\n` +
          `  stderr: ${(e.stderr ?? "").slice(0, 800)}\n` +
          `  program written to ${programPath}`
      );
    }

    const outcomes = parseHarnessOutput(stdout, inputs.length);

    // Any case the reference solution could not produce means the reference is
    // wrong, not the student. Refuse to emit a question built on it.
    outcomes.forEach((o, i) => {
      if (!o.ok) {
        fail(
          `${label}: reference solution errored on testInputs[${i}] — ${o.error}\n` +
            `  program written to ${programPath}`
        );
      }
    });

    totalCases += outcomes.length;

    out.push({
      text: draft.text,
      category: draft.category,
      difficulty: draft.difficulty,
      coding: {
        functionName: spec.functionName,
        paramTypes: spec.paramTypes,
        returnType: spec.returnType,
        starterCode: spec.starterCode,
        testCases: spec.testInputs.map((t, i) => ({
          input: t.input,
          expected: JSON.stringify((outcomes[i] as { ok: true; value: unknown }).value),
          isSample: t.isSample ?? false,
        })),
      },
    });

    // Progress goes to stderr so stdout carries nothing but the JSON, and the
    // command can be redirected straight into a file.
    const sampleCount = spec.testInputs.filter((t) => t.isSample).length;
    console.error(
      `  ok  ${draft.coding.functionName.padEnd(28)} ${outcomes.length} case(s), ${sampleCount} sample`
    );
  });

  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  console.error(`\n${drafts.length} question(s), ${totalCases} test case(s) computed.`);
}

main();
