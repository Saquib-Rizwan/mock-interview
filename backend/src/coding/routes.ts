import { Router } from "express";
import { asyncHandler } from "../asyncHandler";
import { requireAuth } from "../auth/middleware";
import { prisma } from "../prisma";
import { executionLimiter, llmLimiter } from "../rateLimits";
import { CodingLanguage } from "../generated/prisma/enums";
import { Judge0Error, JUDGE0_STATUS, runProgram } from "../judge0/client";
import { LANGUAGE_LABELS, MONACO_LANGUAGE_IDS } from "../judge0/languages";
import { buildSource, parseHarnessOutput } from "./harness";
import type { HarnessSpec } from "./harness";
import { isSupportedType, valuesMatch } from "./types";

export const codingRouter = Router();

codingRouter.use(requireAuth);

const LANGUAGES = Object.values(CodingLanguage) as string[];
const MAX_SOURCE_LENGTH = 50_000;

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8001";
const REVIEW_TIMEOUT_MS = 60_000;

type CodeReview = {
  summary: string;
  strengths: string[];
  improvements: string[];
  time_complexity: string;
  space_complexity: string;
};

/**
 * Everything the editor needs to render a coding question.
 *
 * Hidden test cases contribute their count and nothing else — neither their
 * inputs nor their expected values leave the server. Sending hidden inputs
 * would let a student special-case them; sending expected values would let them
 * return the answer without solving anything. Same principle as Phase 4 keeping
 * expectedAnswerPoints server-side.
 */
codingRouter.get(
  "/questions/:id",
  asyncHandler(async (req, res) => {
    const question = await prisma.question.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        text: true,
        difficulty: true,
        category: true,
        questionType: true,
        codingSpec: true,
        testCases: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            input: true,
            expected: true,
            isSample: true,
            orderIndex: true,
          },
        },
      },
    });

    if (!question) return res.status(404).json({ error: "Question not found" });
    if (question.questionType !== "coding") {
      return res.status(400).json({ error: "This is not a coding question" });
    }
    if (!question.codingSpec) {
      return res
        .status(409)
        .json({ error: "This coding question has no function signature configured" });
    }
    if (question.testCases.length === 0) {
      return res.status(409).json({ error: "This coding question has no test cases" });
    }

    const samples = question.testCases.filter((t) => t.isSample);

    res.json({
      question: {
        id: question.id,
        text: question.text,
        difficulty: question.difficulty,
        category: question.category,
        functionName: question.codingSpec.functionName,
        paramTypes: question.codingSpec.paramTypes,
        returnType: question.codingSpec.returnType,
        starterCode: question.codingSpec.starterCode,
        sampleTests: samples.map((t) => ({
          id: t.id,
          input: t.input,
          expected: t.expected,
        })),
        hiddenTestCount: question.testCases.length - samples.length,
        languages: (Object.values(CodingLanguage) as CodingLanguage[]).map((id) => ({
          id,
          label: LANGUAGE_LABELS[id],
          monacoId: MONACO_LANGUAGE_IDS[id],
        })),
      },
    });
  })
);

codingRouter.post(
  "/submissions",
  executionLimiter,
  asyncHandler(async (req, res) => {
    const { questionId, language, sourceCode } = (req.body ?? {}) as Record<string, unknown>;

    if (typeof questionId !== "string" || !questionId) {
      return res.status(400).json({ error: "questionId is required" });
    }
    if (typeof language !== "string" || !LANGUAGES.includes(language)) {
      return res.status(400).json({ error: `language must be one of: ${LANGUAGES.join(", ")}` });
    }
    if (typeof sourceCode !== "string" || !sourceCode.trim()) {
      return res.status(400).json({ error: "Code is required" });
    }
    if (sourceCode.length > MAX_SOURCE_LENGTH) {
      return res
        .status(400)
        .json({ error: `Code must be under ${MAX_SOURCE_LENGTH} characters` });
    }

    // Signature and test cases come from the database, never the request — the
    // same rule as Phase 4's expected answer points. A client that could supply
    // its own test cases could pass every one of them.
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        questionType: true,
        codingSpec: true,
        testCases: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (!question) return res.status(404).json({ error: "Question not found" });
    if (question.questionType !== "coding") {
      return res.status(400).json({ error: "This is not a coding question" });
    }
    if (!question.codingSpec) {
      return res
        .status(409)
        .json({ error: "This coding question has no function signature configured" });
    }
    if (question.testCases.length === 0) {
      return res.status(409).json({ error: "This coding question has no test cases" });
    }

    const paramTypes = question.codingSpec.paramTypes.filter(isSupportedType);
    if (paramTypes.length !== question.codingSpec.paramTypes.length) {
      return res.status(409).json({ error: "This question uses an unsupported parameter type" });
    }
    if (!isSupportedType(question.codingSpec.returnType)) {
      return res.status(409).json({ error: "This question uses an unsupported return type" });
    }

    const spec: HarnessSpec = {
      functionName: question.codingSpec.functionName,
      paramTypes,
      returnType: question.codingSpec.returnType,
    };

    let inputs: unknown[][];
    let expectedValues: unknown[];
    try {
      inputs = question.testCases.map((t) => JSON.parse(t.input) as unknown[]);
      expectedValues = question.testCases.map((t) => JSON.parse(t.expected) as unknown);
    } catch {
      return res.status(409).json({ error: "This question has a malformed test case" });
    }

    const program = buildSource(language as CodingLanguage, spec, sourceCode, inputs);

    let run;
    try {
      run = await runProgram(language as CodingLanguage, program);
    } catch (err) {
      // Nothing is written when execution itself fails: a submission row with no
      // results would look like an attempt that scored zero.
      const message =
        err instanceof Judge0Error ? err.message : "Could not run your code. Please try again.";
      return res.status(502).json({ error: message });
    }

    if (run.statusId === JUDGE0_STATUS.COMPILATION_ERROR) {
      // Deliberately not persisted — a program that never compiled is not a
      // graded attempt, and storing it would create submissions with no results.
      return res.status(200).json({
        compileError: run.compileOutput ?? "Compilation failed",
        submission: null,
        results: [],
      });
    }

    const outcomes = parseHarnessOutput(run.stdout, question.testCases.length);

    const graded = question.testCases.map((testCase, i) => {
      const outcome = outcomes[i];
      const passed =
        outcome.ok && valuesMatch(outcome.value, expectedValues[i], spec.returnType);
      return {
        testCase,
        passed,
        actualOutput: outcome.ok ? JSON.stringify(outcome.value) : null,
        stderr: outcome.ok ? null : outcome.error,
      };
    });

    const passedCount = graded.filter((g) => g.passed).length;

    // Per-test time and memory are not available: every case runs inside one
    // program, so Judge0 reports totals. They are recorded on the first result
    // as an approximation of the whole run and left null elsewhere.
    const submission = await prisma.codeSubmission.create({
      data: {
        userId: req.userId!,
        questionId: question.id,
        language: language as CodingLanguage,
        sourceCode,
        passedCount,
        totalCount: question.testCases.length,
        results: {
          create: graded.map((g, i) => ({
            testCaseId: g.testCase.id,
            passed: g.passed,
            actualOutput: g.actualOutput,
            stderr: g.stderr,
            timeMs: i === 0 && run.timeSeconds !== null ? Math.round(run.timeSeconds * 1000) : null,
            memoryKb: i === 0 ? run.memoryKb : null,
          })),
        },
      },
      select: {
        id: true,
        language: true,
        passedCount: true,
        totalCount: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      compileError: null,
      submission,
      timedOut: run.statusId === JUDGE0_STATUS.TIME_LIMIT_EXCEEDED,
      // Hidden cases report pass/fail and the error text only. Their inputs,
      // expected values and the student's actual output all stay server-side.
      results: graded.map((g) => ({
        testCaseId: g.testCase.id,
        orderIndex: g.testCase.orderIndex,
        isSample: g.testCase.isSample,
        passed: g.passed,
        error: g.stderr,
        ...(g.testCase.isSample
          ? {
              input: g.testCase.input,
              expected: g.testCase.expected,
              actual: g.actualOutput,
            }
          : {}),
      })),
    });
  })
);

/**
 * LLM commentary on a submission's approach and quality.
 *
 * Deliberately a separate, on-demand endpoint rather than part of running the
 * tests. The brief is explicit that this is "additive, never a replacement for
 * deterministic test-case judging" — keeping it behind its own request makes
 * that structural: results render without it, and a failure here cannot affect
 * a pass/fail verdict that has already been decided and stored.
 */
codingRouter.post(
  "/submissions/:id/review",
  llmLimiter,
  asyncHandler(async (req, res) => {
    // Scoped by userId as well as id: without it, any student could request a
    // review of another student's code and read it back.
    const submission = await prisma.codeSubmission.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      select: {
        id: true,
        language: true,
        sourceCode: true,
        passedCount: true,
        totalCount: true,
        review: true,
        question: { select: { text: true } },
      },
    });

    if (!submission) return res.status(404).json({ error: "Submission not found" });

    // Cached: the same bytes cannot produce a more useful second opinion, and
    // editing the code produces a new submission anyway.
    if (submission.review) {
      return res.json({ review: submission.review, cached: true });
    }

    let review: CodeReview;
    try {
      const response = await fetch(`${ML_SERVICE_URL}/review-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: submission.question.text,
          language: submission.language,
          source_code: submission.sourceCode,
          passed_count: submission.passedCount,
          total_count: submission.totalCount,
        }),
        signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        return res.status(502).json({
          error: body?.detail ?? `Review service returned HTTP ${response.status}`,
        });
      }
      review = (await response.json()) as CodeReview;
    } catch (err) {
      const reason =
        err instanceof Error && err.name === "TimeoutError"
          ? "Code review timed out. Your test results are unaffected."
          : "Could not reach the review service. Is ml-service running? Your test results are unaffected.";
      return res.status(502).json({ error: reason });
    }

    await prisma.codeSubmission.update({
      where: { id: submission.id },
      data: { review },
    });

    res.status(201).json({ review, cached: false });
  })
);

// History for the logged-in user only, scoped by req.userId rather than by a
// client-supplied id, so one student cannot read another's attempts.
codingRouter.get(
  "/submissions",
  asyncHandler(async (req, res) => {
    const { questionId } = req.query;

    const submissions = await prisma.codeSubmission.findMany({
      where: {
        userId: req.userId!,
        ...(typeof questionId === "string" && questionId ? { questionId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        questionId: true,
        language: true,
        sourceCode: true,
        passedCount: true,
        totalCount: true,
        createdAt: true,
        // Present so the UI can show "reviewed" without a second round trip,
        // and reopen an old review rather than paying for it again.
        review: true,
      },
    });

    res.json({ submissions });
  })
);
