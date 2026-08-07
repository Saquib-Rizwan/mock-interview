import type { HarnessSpec } from "./index";
import { RESULT_MARKER } from "./index";
import type { CodingType } from "../types";

/**
 * Java, like C++, gets its test data as generated literals rather than parsed
 * JSON. Judge0 compiles the submission as Main.java, so the entry point must be
 * `public class Main`.
 *
 * The student writes a bare method, which is inlined into a `Solution` class —
 * the LeetCode convention, and what keeps the starter code free of boilerplate.
 */

/** The Java type holding one parameter's value across every test case. */
function storageType(type: CodingType): string {
  switch (type) {
    case "int":
      return "int[]";
    case "long":
      return "long[]";
    case "double":
      return "double[]";
    case "bool":
      return "boolean[]";
    case "string":
      return "String[]";
    case "int[]":
      return "int[][]";
    case "long[]":
      return "long[][]";
    case "double[]":
      return "double[][]";
    case "bool[]":
      return "boolean[][]";
    case "string[]":
      return "String[][]";
    case "int[][]":
      return "int[][][]";
    case "ListNode":
      return "int[][]";
    // Widened to 64-bit so absent children can carry a sentinel no int node
    // value can collide with. A Java int[] has no room for null.
    case "TreeNode":
      return "long[][]";
  }
}

function escapeString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function literal(value: unknown): string {
  if (value === null) return "{}";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `"${escapeString(value)}"`;
  if (Array.isArray(value)) return `{${value.map(literal).join(", ")}}`;
  return "{}";
}

/** Absent children become MI_NULL — see the TreeNode note in storageType. */
function treeLiteral(value: unknown): string {
  if (!Array.isArray(value)) return "{}";
  return `{${value.map((v) => (v === null ? "MI_NULL" : String(v))).join(", ")}}`;
}

export function buildJavaSource(
  spec: HarnessSpec,
  studentCode: string,
  inputs: unknown[][]
): string {
  const declarations = spec.paramTypes
    .map((type, i) => {
      const render = type === "TreeNode" ? treeLiteral : literal;
      const values = inputs.map((args) => render(args[i])).join(", ");
      return `    static ${storageType(type)} __miIn${i} = {${values}};`;
    })
    .join("\n");

  const buildNodes = spec.paramTypes
    .map((type, i) => {
      if (type === "ListNode")
        return `                ListNode __miNode${i} = buildList(__miIn${i}[t]);`;
      if (type === "TreeNode")
        return `                TreeNode __miNode${i} = buildTree(__miIn${i}[t]);`;
      return null;
    })
    .filter(Boolean)
    .join("\n");

  const callArgs = spec.paramTypes
    .map((type, i) =>
      type === "ListNode" || type === "TreeNode" ? `__miNode${i}` : `__miIn${i}[t]`
    )
    .join(", ");

  const emitResult =
    spec.returnType === "ListNode"
      ? `                emit(flattenList(__miR));`
      : spec.returnType === "TreeNode"
        ? `                emitTree(flattenTree(__miR));`
        : `                emit(__miR);`;

  return `import java.util.*;

// Top-level so both Solution and Main can see it.
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }
}

class Solution {
// ---------------- student code ----------------
${studentCode}
// -------------- end student code --------------
}

public class Main {
    // Sentinel for an absent child. Declared before the test data below, since
    // static fields initialise in declaration order.
    static final long MI_NULL = Long.MIN_VALUE;

    static TreeNode buildTree(long[] values) {
        if (values.length == 0 || values[0] == MI_NULL) return null;
        TreeNode root = new TreeNode((int) values[0]);
        ArrayList<TreeNode> queue = new ArrayList<>();
        queue.add(root);
        int head = 0, i = 1;
        while (head < queue.size() && i < values.length) {
            TreeNode node = queue.get(head++);
            if (i < values.length) {
                long v = values[i++];
                if (v != MI_NULL) { node.left = new TreeNode((int) v); queue.add(node.left); }
            }
            if (i < values.length) {
                long v = values[i++];
                if (v != MI_NULL) { node.right = new TreeNode((int) v); queue.add(node.right); }
            }
        }
        return root;
    }

    static long[] flattenTree(TreeNode root) {
        ArrayList<Long> out = new ArrayList<>();
        if (root == null) return new long[0];
        ArrayList<TreeNode> queue = new ArrayList<>();
        queue.add(root);
        int head = 0;
        long guard = 0;
        while (head < queue.size()) {
            TreeNode node = queue.get(head++);
            if (++guard > 100000) throw new RuntimeException("returned tree is cyclic or too large");
            if (node == null) {
                out.add(MI_NULL);
            } else {
                out.add((long) node.val);
                queue.add(node.left);
                queue.add(node.right);
            }
        }
        // [1,2,null] and [1,2] are the same tree; trimming lets them compare equal.
        while (!out.isEmpty() && out.get(out.size() - 1) == MI_NULL) out.remove(out.size() - 1);
        long[] arr = new long[out.size()];
        for (int i = 0; i < arr.length; i++) arr[i] = out.get(i);
        return arr;
    }

    static void emitTree(long[] v) {
        System.out.print("[");
        for (int i = 0; i < v.length; i++) {
            if (i > 0) System.out.print(",");
            if (v[i] == MI_NULL) System.out.print("null"); else System.out.print(v[i]);
        }
        System.out.print("]");
    }

    static ListNode buildList(int[] values) {
        ListNode head = null;
        for (int i = values.length - 1; i >= 0; i--) head = new ListNode(values[i], head);
        return head;
    }

    static int[] flattenList(ListNode node) {
        ArrayList<Integer> out = new ArrayList<>();
        long guard = 0;
        while (node != null) {
            out.add(node.val);
            // A cycle would spin until the CPU limit kills the run, taking every
            // later test case with it.
            if (++guard > 100000) throw new RuntimeException("returned list is cyclic");
            node = node.next;
        }
        int[] arr = new int[out.size()];
        for (int i = 0; i < arr.length; i++) arr[i] = out.get(i);
        return arr;
    }

    static void emit(int v) { System.out.print(v); }
    static void emit(long v) { System.out.print(v); }
    static void emit(double v) { System.out.print(v); }
    static void emit(boolean v) { System.out.print(v ? "true" : "false"); }

    static void emit(String v) {
        if (v == null) { System.out.print("null"); return; }
        StringBuilder sb = new StringBuilder("\\"");
        for (char c : v.toCharArray()) {
            if (c == '"' || c == '\\\\') sb.append('\\\\').append(c);
            else if (c == '\\n') sb.append("\\\\n");
            else if (c == '\\r') sb.append("\\\\r");
            else if (c == '\\t') sb.append("\\\\t");
            else sb.append(c);
        }
        System.out.print(sb.append('"'));
    }

    static void emit(int[] v) { System.out.print("["); for (int i = 0; i < v.length; i++) { if (i > 0) System.out.print(","); emit(v[i]); } System.out.print("]"); }
    static void emit(long[] v) { System.out.print("["); for (int i = 0; i < v.length; i++) { if (i > 0) System.out.print(","); emit(v[i]); } System.out.print("]"); }
    static void emit(double[] v) { System.out.print("["); for (int i = 0; i < v.length; i++) { if (i > 0) System.out.print(","); emit(v[i]); } System.out.print("]"); }
    static void emit(boolean[] v) { System.out.print("["); for (int i = 0; i < v.length; i++) { if (i > 0) System.out.print(","); emit(v[i]); } System.out.print("]"); }
    static void emit(String[] v) { System.out.print("["); for (int i = 0; i < v.length; i++) { if (i > 0) System.out.print(","); emit(v[i]); } System.out.print("]"); }
    static void emit(int[][] v) { System.out.print("["); for (int i = 0; i < v.length; i++) { if (i > 0) System.out.print(","); emit(v[i]); } System.out.print("]"); }

${declarations}

    public static void main(String[] args) {
        Solution __miSolution = new Solution();
        int __miN = ${inputs.length};
        for (int t = 0; t < __miN; t++) {
            try {
${buildNodes}
                var __miR = __miSolution.${spec.functionName}(${callArgs});
                System.out.print("${RESULT_MARKER} " + t + " OK ");
${emitResult}
                System.out.println();
            } catch (Throwable e) {
                // Throwable, not Exception: StackOverflowError from an
                // accidental infinite recursion is common and worth reporting
                // per-case rather than killing the whole run.
                String msg = e.getClass().getSimpleName();
                if (e.getMessage() != null) msg += ": " + e.getMessage().replace('\\n', ' ');
                System.out.println("${RESULT_MARKER} " + t + " ERR " + msg);
            }
        }
    }
}
`;
}
