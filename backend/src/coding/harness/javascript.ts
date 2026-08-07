import type { HarnessSpec } from "./index";
import { RESULT_MARKER } from "./index";

/**
 * Like Python, JavaScript parses JSON natively, so the inputs are embedded as a
 * string literal rather than generated as native syntax.
 *
 * The student's code is wrapped in an eval-free way: it is inlined at top level,
 * so a function declared with `function twoSum(...)` or assigned to a `var` is
 * in scope for the runner below. `const`/`let` at top level work too, since it
 * is all one script.
 */
export function buildJavaScriptSource(
  spec: HarnessSpec,
  studentCode: string,
  inputs: unknown[][]
): string {
  const buildArgs = spec.paramTypes
    .map((type, i) => {
      if (type === "ListNode") return `      args[${i}] = __miBuildList(args[${i}]);`;
      if (type === "TreeNode") return `      args[${i}] = __miBuildTree(args[${i}]);`;
      return null;
    })
    .filter(Boolean)
    .join("\n");

  const flattenReturn =
    spec.returnType === "ListNode"
      ? "      r = __miFlattenList(r);\n"
      : spec.returnType === "TreeNode"
        ? "      r = __miFlattenTree(r);\n"
        : "";

  return `// Defined before the student's code so their solution can construct nodes.
function ListNode(val, next) {
  this.val = val === undefined ? 0 : val;
  this.next = next === undefined ? null : next;
}

function __miBuildList(values) {
  let head = null;
  for (let i = values.length - 1; i >= 0; i--) head = new ListNode(values[i], head);
  return head;
}

function __miFlattenList(node) {
  const out = [];
  let guard = 0;
  while (node !== null && node !== undefined) {
    out.push(node.val);
    // A cycle would otherwise spin until the CPU limit kills the whole run,
    // taking every later test case with it.
    if (++guard > 100000) throw new Error("returned list is cyclic");
    node = node.next;
  }
  return out;
}

function TreeNode(val, left, right) {
  this.val = val === undefined ? 0 : val;
  this.left = left === undefined ? null : left;
  this.right = right === undefined ? null : right;
}

function __miBuildTree(values) {
  if (!values || values.length === 0 || values[0] === null) return null;
  const root = new TreeNode(values[0]);
  const queue = [root];
  let head = 0;
  let i = 1;
  while (head < queue.length && i < values.length) {
    const node = queue[head++];
    if (i < values.length) {
      const v = values[i++];
      if (v !== null) { node.left = new TreeNode(v); queue.push(node.left); }
    }
    if (i < values.length) {
      const v = values[i++];
      if (v !== null) { node.right = new TreeNode(v); queue.push(node.right); }
    }
  }
  return root;
}

function __miFlattenTree(root) {
  if (root === null || root === undefined) return [];
  const out = [];
  const queue = [root];
  let head = 0;
  let guard = 0;
  while (head < queue.length) {
    const node = queue[head++];
    if (++guard > 100000) throw new Error("returned tree is cyclic or too large");
    if (node === null || node === undefined) {
      out.push(null);
    } else {
      out.push(node.val);
      queue.push(node.left === undefined ? null : node.left);
      queue.push(node.right === undefined ? null : node.right);
    }
  }
  // [1,2,null] and [1,2] describe the same tree, so trailing nulls are trimmed
  // to let equal trees compare equal.
  while (out.length > 0 && out[out.length - 1] === null) out.pop();
  return out;
}

// ---------------- student code ----------------
${studentCode}
// -------------- end student code --------------

const __miInputs = JSON.parse(${JSON.stringify(JSON.stringify(inputs))});

for (let __i = 0; __i < __miInputs.length; __i++) {
  try {
    const args = __miInputs[__i].slice();
${buildArgs}
    let r = ${spec.functionName}(...args);
${flattenReturn}    console.log("${RESULT_MARKER}", __i, "OK", JSON.stringify(r === undefined ? null : r));
  } catch (e) {
    const msg = String((e && e.message) || e).replace(/\\n/g, " ");
    console.log("${RESULT_MARKER}", __i, "ERR", msg);
  }
}
`;
}
