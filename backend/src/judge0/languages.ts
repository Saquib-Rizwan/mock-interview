import type { CodingLanguage } from "../generated/prisma/enums";

/**
 * Maps our CodingLanguage enum to Judge0 language ids.
 *
 * These ids belong to a specific Judge0 build, not to our data model — which is
 * why they live here rather than in the Prisma schema. Judge0 CE v1.13.1 is what
 * `docs/phase-log/phase-6-coding-rounds.md` documents as deployed; if that
 * changes, `GET /languages` on the instance lists the current ids.
 */
export const JUDGE0_LANGUAGE_IDS: Record<CodingLanguage, number> = {
  python: 71, // Python 3.8.1
  javascript: 63, // JavaScript (Node.js 12.14.0)
  cpp: 54, // C++ (GCC 9.2.0)
  java: 62, // Java (OpenJDK 13.0.1)
};

/** Display names for the editor's language switcher. */
export const LANGUAGE_LABELS: Record<CodingLanguage, string> = {
  python: "Python",
  javascript: "JavaScript",
  cpp: "C++",
  java: "Java",
};

/** Monaco's language identifiers, which differ from ours for C++. */
export const MONACO_LANGUAGE_IDS: Record<CodingLanguage, string> = {
  python: "python",
  javascript: "javascript",
  cpp: "cpp",
  java: "java",
};
