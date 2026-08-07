import { Router } from "express";
import { asyncHandler } from "../asyncHandler";
import { requireAuth } from "../auth/middleware";
import { prisma } from "../prisma";
import { llmLimiter } from "../rateLimits";

export const submissionsRouter = Router();

submissionsRouter.use(requireAuth);

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8001";
const MAX_ANSWER_LENGTH = 8000;

// Grading can involve a slow model call, but a request that hangs forever is
// worse than one that fails clearly.
const ANALYZE_TIMEOUT_MS = 60_000;

type AnalyzeResult = {
  points: { point: string; covered: boolean; comment: string }[];
  gap_analysis: string;
  suggested_answer: string;
};

submissionsRouter.post(
  "/",
  llmLimiter,
  asyncHandler(async (req, res) => {
    const { questionId, answerText } = (req.body ?? {}) as Record<string, unknown>;

    if (typeof questionId !== "string" || !questionId) {
      return res.status(400).json({ error: "questionId is required" });
    }
    if (typeof answerText !== "string" || !answerText.trim()) {
      return res.status(400).json({ error: "An answer is required" });
    }
    if (answerText.length > MAX_ANSWER_LENGTH) {
      return res
        .status(400)
        .json({ error: `Answer must be under ${MAX_ANSWER_LENGTH} characters` });
    }

    // Criteria are loaded from the database, never taken from the request.
    // Trusting client-supplied expected points would let a student grade
    // themselves against whatever they liked.
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        text: true,
        questionType: true,
        expectedAnswerPoints: true,
      },
    });

    if (!question) return res.status(404).json({ error: "Question not found" });

    if (question.questionType !== "text") {
      return res
        .status(400)
        .json({ error: "Coding questions are not answered this way" });
    }
    if (question.expectedAnswerPoints.length === 0) {
      return res
        .status(409)
        .json({ error: "This question has no expected answer points to grade against" });
    }

    let analysis: AnalyzeResult;
    try {
      const mlResponse = await fetch(`${ML_SERVICE_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.text,
          expected_answer_points: question.expectedAnswerPoints,
          student_answer: answerText,
        }),
        signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
      });

      if (!mlResponse.ok) {
        // FastAPI puts HTTPException messages in `detail`.
        const body = (await mlResponse.json().catch(() => null)) as {
          detail?: string;
        } | null;
        return res.status(502).json({
          error: body?.detail ?? `Analysis service returned HTTP ${mlResponse.status}`,
        });
      }

      analysis = (await mlResponse.json()) as AnalyzeResult;
    } catch (err) {
      // Nothing is written on failure: a submission row with empty feedback
      // would look like a graded attempt in the student's history.
      const reason =
        err instanceof Error && err.name === "TimeoutError"
          ? "Analysis timed out. Please try again."
          : "Could not reach the analysis service. Is ml-service running?";
      return res.status(502).json({ error: reason });
    }

    const submission = await prisma.submission.create({
      data: {
        userId: req.userId!,
        questionId: question.id,
        answerText,
        gapAnalysis: analysis.gap_analysis,
        suggestedAnswer: analysis.suggested_answer,
        // Persisted as of Phase 7. Previously these were shown once and thrown
        // away, which meant a text answer could never be scored after the fact
        // — no progress view, no sense of which points a student keeps missing.
        points: analysis.points,
      },
      select: {
        id: true,
        answerText: true,
        gapAnalysis: true,
        suggestedAnswer: true,
        createdAt: true,
      },
    });

    res.status(201).json({ submission, points: analysis.points });
  })
);

// History for the logged-in user only. Scoping by req.userId rather than
// accepting a userId parameter means one student cannot read another's work.
submissionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { questionId } = req.query;

    const submissions = await prisma.submission.findMany({
      where: {
        userId: req.userId!,
        ...(typeof questionId === "string" && questionId ? { questionId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        questionId: true,
        answerText: true,
        gapAnalysis: true,
        suggestedAnswer: true,
        createdAt: true,
      },
    });

    res.json({ submissions });
  })
);
