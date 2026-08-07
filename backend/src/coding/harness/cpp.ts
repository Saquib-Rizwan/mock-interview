import type { HarnessSpec } from "./index";
import { RESULT_MARKER } from "./index";
import type { CodingType } from "../types";

/**
 * C++ has no JSON support, so nothing is parsed at runtime: the test inputs are
 * emitted as brace-initialised literals and the output printers are generated
 * per type. That is the whole reason the supported type vocabulary is small.
 *
 * A ListNode parameter is stored as std::vector<int> and converted to a real
 * linked list inside the loop, so the literal syntax stays simple.
 */

/** The C++ type a value is *stored* as. ListNode is built from its array form. */
function storageType(type: CodingType): string {
  switch (type) {
    case "int":
      return "int";
    case "long":
      return "long long";
    case "double":
      return "double";
    case "bool":
      return "bool";
    case "string":
      return "std::string";
    case "int[]":
      return "std::vector<int>";
    case "long[]":
      return "std::vector<long long>";
    case "double[]":
      return "std::vector<double>";
    case "bool[]":
      return "std::vector<bool>";
    case "string[]":
      return "std::vector<std::string>";
    case "int[][]":
      return "std::vector<std::vector<int>>";
    case "ListNode":
      return "std::vector<int>";
    // Widened to 64-bit so absent children can be marked with a sentinel that
    // no int node value can collide with. std::vector<int> has no room for null.
    case "TreeNode":
      return "std::vector<long long>";
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

/** Renders one JSON value as a C++ brace-initialiser. */
function literal(value: unknown): string {
  if (value === null) return "{}";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `"${escapeString(value)}"`;
  if (Array.isArray(value)) return `{${value.map(literal).join(", ")}}`;
  return "{}";
}

/**
 * A tree's wire format is a level-order array containing nulls. C++ has no null
 * int, so absent children become __MI_NULL — a 64-bit sentinel outside the range
 * of any int node value, which is why the array is widened to long long.
 */
function treeLiteral(value: unknown): string {
  if (!Array.isArray(value)) return "{}";
  return `{${value.map((v) => (v === null ? "__MI_NULL" : String(v))).join(", ")}}`;
}

export function buildCppSource(
  spec: HarnessSpec,
  studentCode: string,
  inputs: unknown[][]
): string {
  const declarations = spec.paramTypes
    .map((type, i) => {
      const render = type === "TreeNode" ? treeLiteral : literal;
      const values = inputs.map((args) => render(args[i])).join(", ");
      return `static std::vector<${storageType(type)}> __mi_in${i} = {${values}};`;
    })
    .join("\n");

  const callArgs = spec.paramTypes
    .map((type, i) =>
      type === "ListNode" || type === "TreeNode" ? `__mi_node${i}` : `__mi_in${i}[__t]`
    )
    .join(", ");

  const buildNodes = spec.paramTypes
    .map((type, i) => {
      if (type === "ListNode")
        return `            ListNode* __mi_node${i} = __mi_build(__mi_in${i}[__t]);`;
      if (type === "TreeNode")
        return `            TreeNode* __mi_node${i} = __mi_build_tree(__mi_in${i}[__t]);`;
      return null;
    })
    .filter(Boolean)
    .join("\n");

  const emitResult =
    spec.returnType === "ListNode"
      ? `            std::vector<int> __mi_flat = __mi_flatten(__mi_r);
            __mi_emit(__mi_flat);`
      : spec.returnType === "TreeNode"
        ? `            std::vector<long long> __mi_flat = __mi_flatten_tree(__mi_r);
            __mi_emit_tree(__mi_flat);`
        : `            __mi_emit(__mi_r);`;

  return `#include <bits/stdc++.h>
using namespace std;

// Defined before the student's code so their solution can construct nodes.
struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *n) : val(x), next(n) {}
};

static ListNode* __mi_build(const std::vector<int>& values) {
    ListNode* head = nullptr;
    for (int i = (int)values.size() - 1; i >= 0; --i) head = new ListNode(values[i], head);
    return head;
}

static std::vector<int> __mi_flatten(ListNode* node) {
    std::vector<int> out;
    long long guard = 0;
    while (node != nullptr) {
        out.push_back(node->val);
        // A cycle would spin until the CPU limit kills the run, losing every
        // later test case as well as this one.
        if (++guard > 100000) throw std::runtime_error("returned list is cyclic");
        node = node->next;
    }
    return out;
}

// Sentinel for an absent child. Outside the range of any int node value, so it
// can never be mistaken for real data.
static const long long __MI_NULL = std::numeric_limits<long long>::min();

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *l, TreeNode *r) : val(x), left(l), right(r) {}
};

static TreeNode* __mi_build_tree(const std::vector<long long>& values) {
    if (values.empty() || values[0] == __MI_NULL) return nullptr;
    TreeNode* root = new TreeNode((int)values[0]);
    std::vector<TreeNode*> queue{root};
    size_t head = 0, i = 1;
    while (head < queue.size() && i < values.size()) {
        TreeNode* node = queue[head++];
        if (i < values.size()) {
            long long v = values[i++];
            if (v != __MI_NULL) { node->left = new TreeNode((int)v); queue.push_back(node->left); }
        }
        if (i < values.size()) {
            long long v = values[i++];
            if (v != __MI_NULL) { node->right = new TreeNode((int)v); queue.push_back(node->right); }
        }
    }
    return root;
}

static std::vector<long long> __mi_flatten_tree(TreeNode* root) {
    std::vector<long long> out;
    if (root == nullptr) return out;
    std::vector<TreeNode*> queue{root};
    size_t head = 0;
    long long guard = 0;
    while (head < queue.size()) {
        TreeNode* node = queue[head++];
        if (++guard > 100000) throw std::runtime_error("returned tree is cyclic or too large");
        if (node == nullptr) {
            out.push_back(__MI_NULL);
        } else {
            out.push_back(node->val);
            queue.push_back(node->left);
            queue.push_back(node->right);
        }
    }
    // [1,2,null] and [1,2] are the same tree, so trailing nulls are trimmed to
    // let equal trees compare equal.
    while (!out.empty() && out.back() == __MI_NULL) out.pop_back();
    return out;
}

static void __mi_emit_tree(const std::vector<long long>& v) {
    std::cout << "[";
    for (size_t i = 0; i < v.size(); ++i) {
        if (i) std::cout << ",";
        if (v[i] == __MI_NULL) std::cout << "null"; else std::cout << v[i];
    }
    std::cout << "]";
}

static void __mi_emit_string(const std::string& v) {
    std::cout << '"';
    for (char c : v) {
        if (c == '"' || c == '\\\\') std::cout << '\\\\' << c;
        else if (c == '\\n') std::cout << "\\\\n";
        else if (c == '\\r') std::cout << "\\\\r";
        else if (c == '\\t') std::cout << "\\\\t";
        else std::cout << c;
    }
    std::cout << '"';
}

// Explicit overloads rather than a template: std::vector<bool> is a bitset
// specialisation whose operator[] returns a proxy, which makes template
// overload resolution ambiguous against the integer overloads.
static void __mi_emit(int v) { std::cout << v; }
static void __mi_emit(long long v) { std::cout << v; }
static void __mi_emit(double v) { std::cout << std::setprecision(10) << v; }
static void __mi_emit(bool v) { std::cout << (v ? "true" : "false"); }
static void __mi_emit(const std::string& v) { __mi_emit_string(v); }
static void __mi_emit(const std::vector<int>& v) {
    std::cout << "["; for (size_t i = 0; i < v.size(); ++i) { if (i) std::cout << ","; __mi_emit(v[i]); } std::cout << "]";
}
static void __mi_emit(const std::vector<long long>& v) {
    std::cout << "["; for (size_t i = 0; i < v.size(); ++i) { if (i) std::cout << ","; __mi_emit(v[i]); } std::cout << "]";
}
static void __mi_emit(const std::vector<double>& v) {
    std::cout << "["; for (size_t i = 0; i < v.size(); ++i) { if (i) std::cout << ","; __mi_emit(v[i]); } std::cout << "]";
}
static void __mi_emit(const std::vector<bool>& v) {
    std::cout << "["; for (size_t i = 0; i < v.size(); ++i) { if (i) std::cout << ","; bool b = v[i]; __mi_emit(b); } std::cout << "]";
}
static void __mi_emit(const std::vector<std::string>& v) {
    std::cout << "["; for (size_t i = 0; i < v.size(); ++i) { if (i) std::cout << ","; __mi_emit(v[i]); } std::cout << "]";
}
static void __mi_emit(const std::vector<std::vector<int>>& v) {
    std::cout << "["; for (size_t i = 0; i < v.size(); ++i) { if (i) std::cout << ","; __mi_emit(v[i]); } std::cout << "]";
}

// ---------------- student code ----------------
${studentCode}
// -------------- end student code --------------

${declarations}

int main() {
    size_t __mi_n = ${inputs.length};
    for (size_t __t = 0; __t < __mi_n; ++__t) {
        try {
${buildNodes}
            auto __mi_r = ${spec.functionName}(${callArgs});
            std::cout << "${RESULT_MARKER} " << __t << " OK ";
${emitResult}
            std::cout << std::endl;
        } catch (const std::exception& e) {
            std::cout << "${RESULT_MARKER} " << __t << " ERR " << e.what() << std::endl;
        } catch (...) {
            std::cout << "${RESULT_MARKER} " << __t << " ERR unknown error" << std::endl;
        }
    }
    return 0;
}
`;
}
