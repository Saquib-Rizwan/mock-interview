import type { CodingLanguage } from "../../generated/prisma/enums";
import type { CodingType } from "../types";
import { buildPythonSource } from "./python";
import { buildJavaScriptSource } from "./javascript";
import { buildCppSource } from "./cpp";
import { buildJavaSource } from "./java";

/**
 * A harness is a complete program built from three parts: the student's
 * function, the test inputs as native literals, and a runner that calls the
 * function once per case and prints the result.
 *
 * All cases run inside a single program rather than one Judge0 submission each.
 * Compilation dominates runtime for C++ and Java, so N submissions would mean N
 * compiles; and embedding the inputs as literals means neither language needs a
 * JSON parser, which would otherwise be the hard part of supporting them.
 */

export type HarnessSpec = {
  functionName: string;
  paramTypes: CodingType[];
  returnType: CodingType;
};

/**
 * Prefix on every result line.
 *
 * Students print debug output constantly, and without a marker their `print()`
 * calls would be indistinguishable from results. Lines that do not start with
 * this are ignored, so debugging never breaks grading.
 */
export const RESULT_MARKER = "__MI_RESULT__";

export type HarnessOutcome =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export function buildSource(
  language: CodingLanguage,
  spec: HarnessSpec,
  studentCode: string,
  /** One entry per test case, each an array of arguments. */
  inputs: unknown[][]
): string {
  switch (language) {
    case "python":
      return buildPythonSource(spec, studentCode, inputs);
    case "javascript":
      return buildJavaScriptSource(spec, studentCode, inputs);
    case "cpp":
      return buildCppSource(spec, studentCode, inputs);
    case "java":
      return buildJavaSource(spec, studentCode, inputs);
  }
}

/**
 * Reads the marked result lines out of a program's stdout.
 *
 * Returns one entry per expected test case. Cases with no line are reported as
 * "did not run" — which is what a C++ segfault partway through looks like,
 * since the process dies and later cases never execute.
 */
export function parseHarnessOutput(
  stdout: string | null,
  caseCount: number
): HarnessOutcome[] {
  const byIndex = new Map<number, HarnessOutcome>();

  for (const line of (stdout ?? "").split("\n")) {
    if (!line.startsWith(RESULT_MARKER)) continue;

    const rest = line.slice(RESULT_MARKER.length).trim();
    const match = /^(\d+)\s+(OK|ERR)\s?([\s\S]*)$/.exec(rest);
    if (!match) continue;

    const index = Number(match[1]);
    const kind = match[2];
    const payload = match[3];

    if (kind === "ERR") {
      byIndex.set(index, { ok: false, error: payload || "Error" });
      continue;
    }

    try {
      byIndex.set(index, { ok: true, value: JSON.parse(payload) });
    } catch {
      // The program claimed success but printed something unparseable. Treat it
      // as a failure rather than silently comparing against garbage.
      byIndex.set(index, { ok: false, error: `Unreadable output: ${payload.slice(0, 200)}` });
    }
  }

  return Array.from({ length: caseCount }, (_, i) =>
    byIndex.get(i) ?? { ok: false, error: "Did not run" }
  );
}
