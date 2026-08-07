import type { HarnessSpec } from "./index";
import { RESULT_MARKER } from "./index";

/**
 * Python needs no literal generation: `json` is in the standard library, so the
 * inputs travel as a JSON string and are parsed at runtime.
 *
 * The JSON is embedded via JSON.stringify, which produces a string literal that
 * is valid in both languages — so a test case containing quotes, backslashes or
 * newlines cannot break out of it.
 */
export function buildPythonSource(
  spec: HarnessSpec,
  studentCode: string,
  inputs: unknown[][]
): string {
  const buildArgs = spec.paramTypes
    .map((type, i) => {
      if (type === "ListNode") return `        __call[${i}] = __mi_build_list(__call[${i}])`;
      if (type === "TreeNode") return `        __call[${i}] = __mi_build_tree(__call[${i}])`;
      return null;
    })
    .filter(Boolean)
    .join("\n");

  const flattenReturn =
    spec.returnType === "ListNode"
      ? "        __r = __mi_flatten_list(__r)\n"
      : spec.returnType === "TreeNode"
        ? "        __r = __mi_flatten_tree(__r)\n"
        : "";

  return `import json
import sys


# Defined before the student's code so their solution can construct and return
# nodes using the same class the harness reads back.
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


def __mi_build_list(values):
    head = None
    for __v in reversed(values):
        head = ListNode(__v, head)
    return head


def __mi_flatten_list(node):
    out = []
    guard = 0
    while node is not None:
        out.append(node.val)
        guard += 1
        # A solution that accidentally creates a cycle would otherwise hang here
        # until the CPU limit kills the whole run, losing every later case.
        if guard > 100000:
            raise RuntimeError("returned list is cyclic")
        node = node.next
    return out


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def __mi_build_tree(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = [root]
    head = 0
    i = 1
    while head < len(queue) and i < len(values):
        node = queue[head]
        head += 1
        if i < len(values):
            v = values[i]
            i += 1
            if v is not None:
                node.left = TreeNode(v)
                queue.append(node.left)
        if i < len(values):
            v = values[i]
            i += 1
            if v is not None:
                node.right = TreeNode(v)
                queue.append(node.right)
    return root


def __mi_flatten_tree(root):
    if root is None:
        return []
    out = []
    queue = [root]
    head = 0
    guard = 0
    while head < len(queue):
        node = queue[head]
        head += 1
        guard += 1
        if guard > 100000:
            raise RuntimeError("returned tree is cyclic or too large")
        if node is None:
            out.append(None)
        else:
            out.append(node.val)
            queue.append(node.left)
            queue.append(node.right)
    # Trailing nulls are noise: [1,2,null] and [1,2] describe the same tree, so
    # trimming them lets equal trees compare equal.
    while out and out[-1] is None:
        out.pop()
    return out


# ---------------- student code ----------------
${studentCode}
# -------------- end student code --------------

__MI_INPUTS = json.loads(${JSON.stringify(JSON.stringify(inputs))})

for __i, __args in enumerate(__MI_INPUTS):
    try:
        __call = list(__args)
${buildArgs || "        pass"}
        __r = ${spec.functionName}(*__call)
${flattenReturn}        print("${RESULT_MARKER}", __i, "OK", json.dumps(__r))
    except Exception as __e:
        __msg = "{}: {}".format(type(__e).__name__, __e).replace("\\n", " ")
        print("${RESULT_MARKER}", __i, "ERR", __msg)
    sys.stdout.flush()
`;
}
