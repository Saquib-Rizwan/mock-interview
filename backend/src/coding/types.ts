/**
 * The type vocabulary a coding question's signature may use.
 *
 * Deliberately small. Every type here has to be expressible as a literal in
 * Python, JavaScript, C++ and Java, and comparable on the server — so growing
 * this list is four harness changes, not one.
 *
 * Must stay in sync with the comment on CodingSpec in prisma/schema.prisma.
 */
export const SUPPORTED_TYPES = [
  "int",
  "long",
  "double",
  "bool",
  "string",
  "int[]",
  "long[]",
  "double[]",
  "bool[]",
  "string[]",
  "int[][]",
  // Wire format is a JSON array of ints. The harness builds a singly linked
  // list from it before calling the student's function, and flattens whatever
  // comes back into an array again for comparison.
  "ListNode",
  // Wire format is a level-order JSON array with `null` for absent children,
  // e.g. [3,9,20,null,null,15,7]. Trailing nulls are trimmed on the way out so
  // that two encodings of the same tree compare equal.
  //
  // C++ and Java cannot hold a null in an int array, so those harnesses widen
  // the array to 64-bit and use a sentinel that no int value can collide with.
  "TreeNode",
] as const;

export type CodingType = (typeof SUPPORTED_TYPES)[number];

export function isSupportedType(value: string): value is CodingType {
  return (SUPPORTED_TYPES as readonly string[]).includes(value);
}

/** Floating point never compares exactly. Anything within this is equal. */
const EPSILON = 1e-6;

/**
 * Compares a value the student's code produced against the expected value.
 *
 * Both sides are already-parsed JSON. `type` decides only whether numbers get
 * tolerance — structure is compared the same way regardless.
 */
export function valuesMatch(actual: unknown, expected: unknown, type: CodingType): boolean {
  const tolerant = type === "double" || type === "double[]";
  return deepEqual(actual, expected, tolerant);
}

function deepEqual(a: unknown, b: unknown, tolerant: boolean): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i], tolerant));
  }

  if (typeof a === "number" && typeof b === "number") {
    if (tolerant) return Math.abs(a - b) <= EPSILON;
    return a === b;
  }

  return a === b;
}

/**
 * Validates a test case's stored JSON against a question's signature.
 *
 * Called when seeding and before running, so a malformed test case surfaces as
 * a clear server error rather than as a mysterious wrong answer for the student.
 */
export function validateTestCase(
  input: string,
  expected: string,
  paramTypes: CodingType[]
): string[] {
  const errors: string[] = [];

  let args: unknown;
  try {
    args = JSON.parse(input);
  } catch {
    return ["input is not valid JSON"];
  }

  if (!Array.isArray(args)) {
    errors.push("input must be a JSON array of arguments");
  } else if (args.length !== paramTypes.length) {
    errors.push(`input has ${args.length} argument(s), signature expects ${paramTypes.length}`);
  }

  try {
    JSON.parse(expected);
  } catch {
    errors.push("expected is not valid JSON");
  }

  return errors;
}
