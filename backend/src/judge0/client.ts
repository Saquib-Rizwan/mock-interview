import type { CodingLanguage } from "../generated/prisma/enums";
import { JUDGE0_LANGUAGE_IDS } from "./languages";

/**
 * The only module that talks to Judge0.
 *
 * Everything about where code runs lives behind this file and two environment
 * variables, mirroring how ml-service/app/llm.py isolates the model provider.
 * Moving to a different Judge0 host — a bigger VM, a managed instance — is a
 * change to JUDGE0_URL, not to any code that calls this.
 */

const JUDGE0_URL = process.env.JUDGE0_URL;
const JUDGE0_TOKEN = process.env.JUDGE0_TOKEN;

/**
 * Wall-clock ceiling for the whole request. Generous because a cold C++ or Java
 * compile on a 2-vCPU box is genuinely slow, but bounded because a request that
 * hangs forever is worse than one that fails clearly.
 */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Applies to the student's program, which runs every test case in one process.
 * Judge0 caps this via MAX_CPU_TIME_LIMIT in judge0.conf (15s by default), so
 * raising it here alone would be silently ignored.
 */
const CPU_TIME_LIMIT_SECONDS = 10;

/** Java's JVM alone needs well over the 128MB Judge0 defaults to. */
const MEMORY_LIMIT_KB = 256_000;

/** Judge0 status ids we act on. The rest are grouped as runtime errors. */
export const JUDGE0_STATUS = {
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
} as const;

export type Judge0Result = {
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  statusId: number;
  statusDescription: string;
  timeSeconds: number | null;
  memoryKb: number | null;
};

export class Judge0Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Judge0Error";
  }
}

/** Judge0 returns these fields base64-encoded when base64_encoded=true. */
function decode(value: string | null | undefined): string | null {
  if (!value) return null;
  return Buffer.from(value, "base64").toString("utf8");
}

function requireConfig(): { url: string; token: string } {
  if (!JUDGE0_URL || !JUDGE0_TOKEN) {
    throw new Judge0Error(
      "Code execution is not configured. Set JUDGE0_URL and JUDGE0_TOKEN in backend/.env"
    );
  }
  return { url: JUDGE0_URL.replace(/\/+$/, ""), token: JUDGE0_TOKEN };
}

/**
 * Compiles and runs one program, waiting for the result.
 *
 * Base64 is used in both directions so that source code and program output are
 * carried as opaque bytes. Student code routinely contains quotes, newlines and
 * non-ASCII characters, and output can contain anything at all.
 */
export async function runProgram(
  language: CodingLanguage,
  sourceCode: string
): Promise<Judge0Result> {
  const { url, token } = requireConfig();

  let response: Response;
  try {
    response = await fetch(`${url}/submissions?base64_encoded=true&wait=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token,
      },
      body: JSON.stringify({
        language_id: JUDGE0_LANGUAGE_IDS[language],
        source_code: Buffer.from(sourceCode, "utf8").toString("base64"),
        cpu_time_limit: CPU_TIME_LIMIT_SECONDS,
        memory_limit: MEMORY_LIMIT_KB,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Judge0Error("Code execution timed out. Please try again.");
    }
    // Overwhelmingly the cause is the VM being deallocated to save credit.
    throw new Judge0Error(
      "Could not reach the code execution service. It may be stopped — see docs/phase-log/phase-6-coding-rounds.md"
    );
  }

  if (response.status === 401) {
    throw new Judge0Error("Code execution rejected our credentials (check JUDGE0_TOKEN)");
  }
  if (!response.ok) {
    throw new Judge0Error(`Code execution service returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    stdout?: string | null;
    stderr?: string | null;
    compile_output?: string | null;
    status?: { id?: number; description?: string };
    time?: string | null;
    memory?: number | null;
  };

  return {
    stdout: decode(body.stdout),
    stderr: decode(body.stderr),
    compileOutput: decode(body.compile_output),
    statusId: body.status?.id ?? 0,
    statusDescription: body.status?.description ?? "Unknown",
    timeSeconds: body.time ? Number(body.time) : null,
    memoryKb: body.memory ?? null,
  };
}

/** Cheap liveness check, used by /health/full. */
export async function judge0Health(): Promise<{ status: string; error?: string }> {
  let url: string;
  let token: string;
  try {
    ({ url, token } = requireConfig());
  } catch (err) {
    return { status: "not configured", error: err instanceof Error ? err.message : undefined };
  }

  try {
    const response = await fetch(`${url}/about`, {
      headers: { "X-Auth-Token": token },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { status: "error", error: `HTTP ${response.status}` };
    const about = (await response.json()) as { version?: string };
    return { status: "ok", error: undefined, ...{ version: about.version } } as {
      status: string;
      error?: string;
    };
  } catch (err) {
    return {
      status: "unreachable",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
