import { Router } from "express";
import { asyncHandler } from "../asyncHandler";
import { requireAuth } from "../auth/middleware";
import { prisma } from "../prisma";

/**
 * Taking a timed MCQ assessment.
 *
 * Two routers because the two resources have genuinely different lifetimes: an
 * assessment is catalogue data shared by everyone, an attempt belongs to one
 * user and is mutable until it is submitted.
 *
 * THE RULE THAT GOVERNS THIS FILE: `correctIndex` and `solution` are never
 * selected while an attempt is open. They are read in exactly one place — the
 * submit handler — and even there they are used to compute a score and then
 * discarded rather than returned. A mock test whose answers can be read from
 * the network tab is not a mock test.
 */
export const assessmentsRouter = Router();
export const attemptsRouter = Router();

assessmentsRouter.use(requireAuth);
attemptsRouter.use(requireAuth);

/** Structure and questions. Options only — never the key. */
assessmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const assessment = await prisma.assessment.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        totalDurationMin: true,
        negativeMarking: true,
        canRevisit: true,
        round: {
          select: {
            id: true,
            roundName: true,
            role: {
              select: { id: true, name: true, company: { select: { id: true, name: true } } },
            },
          },
        },
        sections: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            name: true,
            durationMin: true,
            marksPerQuestion: true,
            questions: {
              orderBy: { order: "asc" },
              select: {
                order: true,
                question: {
                  select: {
                    id: true,
                    text: true,
                    category: true,
                    difficulty: true,
                    // Options and nothing else. correctIndex and solution are
                    // deliberately absent from this select, not filtered out
                    // afterwards — a leak would require adding a field here.
                    mcqSpec: { select: { options: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!assessment) return res.status(404).json({ error: "Assessment not found" });

    res.json({
      assessment: {
        ...assessment,
        sections: assessment.sections.map((s) => ({
          ...s,
          questions: s.questions.map((aq) => ({
            id: aq.question.id,
            text: aq.question.text,
            category: aq.question.category,
            difficulty: aq.question.difficulty,
            options: aq.question.mcqSpec?.options ?? [],
          })),
        })),
      },
    });
  })
);

/**
 * Start a sitting, or resume the one already open.
 *
 * Resuming rather than always creating: a refresh mid-test would otherwise
 * abandon the attempt and silently restart the clock, which is both lost work
 * and a way to reset the timer.
 */
assessmentsRouter.post(
  "/:id/attempts",
  asyncHandler(async (req, res) => {
    const assessment = await prisma.assessment.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });

    const open = await prisma.assessmentAttempt.findFirst({
      where: { userId: req.userId!, assessmentId: assessment.id, submittedAt: null },
      orderBy: { startedAt: "desc" },
      select: { id: true, startedAt: true, answers: true },
    });
    if (open) return res.json({ attempt: open, resumed: true });

    const attempt = await prisma.assessmentAttempt.create({
      data: { userId: req.userId!, assessmentId: assessment.id },
      select: { id: true, startedAt: true, answers: true },
    });
    res.status(201).json({ attempt, resumed: false });
  })
);

/** Loads an attempt, scoped to its owner. */
async function ownedAttempt(attemptId: string, userId: string) {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      assessmentId: true,
      startedAt: true,
      submittedAt: true,
      answers: true,
    },
  });
  // Same 404 whether it does not exist or belongs to someone else: the
  // distinction is only useful to someone probing for other users' attempts.
  if (!attempt || attempt.userId !== userId) return null;
  return attempt;
}

/** Autosave. Answers are replaced wholesale, so an unset key clears a choice. */
attemptsRouter.patch(
  "/:id/answers",
  asyncHandler(async (req, res) => {
    const attempt = await ownedAttempt(req.params.id, req.userId!);
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (attempt.submittedAt) {
      return res.status(409).json({ error: "This attempt has already been submitted" });
    }

    const answers = (req.body ?? {}).answers;
    if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
      return res.status(400).json({ error: "answers must be an object of questionId to index" });
    }
    for (const [, v] of Object.entries(answers as Record<string, unknown>)) {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
        return res.status(400).json({ error: "each answer must be a non-negative integer index" });
      }
    }

    await prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: { answers: answers as object },
    });
    res.json({ saved: true });
  })
);

/**
 * Grade the whole sitting.
 *
 * Scored here and not in the browser for the obvious reason, and computed from
 * McqSpec rather than from anything the client sent.
 */
attemptsRouter.post(
  "/:id/submit",
  asyncHandler(async (req, res) => {
    const attempt = await ownedAttempt(req.params.id, req.userId!);
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (attempt.submittedAt) {
      return res.status(409).json({ error: "This attempt has already been submitted" });
    }

    const assessment = await prisma.assessment.findUnique({
      where: { id: attempt.assessmentId },
      select: {
        negativeMarking: true,
        sections: {
          select: {
            marksPerQuestion: true,
            questions: {
              select: { question: { select: { id: true, mcqSpec: { select: { correctIndex: true } } } } },
            },
          },
        },
      },
    });
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });

    // A late PATCH could otherwise race the submit; take the body's answers if
    // supplied so the final selection is never lost between autosave and send.
    const body = (req.body ?? {}) as { answers?: Record<string, number> };
    const answers: Record<string, number> =
      body.answers && typeof body.answers === "object"
        ? body.answers
        : ((attempt.answers as Record<string, number>) ?? {});

    const negative = assessment.negativeMarking ?? 0;
    let score = 0;
    let maxScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    for (const section of assessment.sections) {
      for (const aq of section.questions) {
        const key = aq.question.mcqSpec?.correctIndex;
        maxScore += section.marksPerQuestion;
        // A question whose spec is missing cannot be marked either way. Counting
        // it as unanswered is the only honest option; it scores nothing and
        // costs nothing.
        if (key === undefined) {
          unansweredCount++;
          continue;
        }
        const chosen = answers[aq.question.id];
        if (chosen === undefined || chosen === null) {
          unansweredCount++;
        } else if (chosen === key) {
          correctCount++;
          score += section.marksPerQuestion;
        } else {
          wrongCount++;
          score -= negative;
        }
      }
    }

    // Two decimals: 0.25 deductions accumulate binary-float noise otherwise,
    // and a score reading -0.7999999999 would look like a bug to a student.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const submittedAt = new Date();

    await prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        submittedAt,
        answers: answers as object,
        score: round2(score),
        maxScore: round2(maxScore),
        correctCount,
        wrongCount,
        unansweredCount,
      },
    });

    res.json({
      result: {
        score: round2(score),
        maxScore: round2(maxScore),
        correctCount,
        wrongCount,
        unansweredCount,
        negativeMarking: assessment.negativeMarking,
        elapsedSec: Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
      },
    });
  })
);

/**
 * The review: what you picked, what was right, and why.
 *
 * THIS IS THE ONLY ROUTE THAT EVER SENDS `correctIndex` OR `solution`, and it
 * refuses unless the attempt has been submitted. That single check is what
 * stops the review being used as an oracle: without it, a student could open a
 * second tab on an in-progress attempt and read the whole key.
 */
attemptsRouter.get(
  "/:id/review",
  asyncHandler(async (req, res) => {
    const attempt = await ownedAttempt(req.params.id, req.userId!);
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (!attempt.submittedAt) {
      return res.status(409).json({
        error: "This attempt is still in progress. Submit it to see the answers.",
      });
    }

    const assessment = await prisma.assessment.findUnique({
      where: { id: attempt.assessmentId },
      select: {
        negativeMarking: true,
        round: { select: { id: true, roundName: true } },
        sections: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            marksPerQuestion: true,
            questions: {
              orderBy: { order: "asc" },
              select: {
                question: {
                  select: {
                    id: true,
                    text: true,
                    category: true,
                    difficulty: true,
                    mcqSpec: { select: { options: true, correctIndex: true, solution: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });

    const answers = (attempt.answers as Record<string, number>) ?? {};
    const negative = assessment.negativeMarking ?? 0;

    const sections = assessment.sections.map((section) => ({
      id: section.id,
      name: section.name,
      questions: section.questions.map(({ question }) => {
        const spec = question.mcqSpec;
        const chosen = answers[question.id];
        const answered = chosen !== undefined && chosen !== null;
        const correct = answered && spec ? chosen === spec.correctIndex : false;
        return {
          id: question.id,
          text: question.text,
          category: question.category,
          difficulty: question.difficulty,
          options: spec?.options ?? [],
          correctIndex: spec?.correctIndex ?? null,
          solution: spec?.solution ?? null,
          chosenIndex: answered ? chosen : null,
          correct,
          // Signed, so the review can show exactly where marks went. An
          // unanswered question is 0 rather than a deduction, which is the
          // whole point of the guess-discipline these papers reward.
          marks: !answered ? 0 : correct ? section.marksPerQuestion : -negative,
        };
      }),
    }));

    res.json({
      review: {
        roundId: assessment.round.id,
        roundName: assessment.round.roundName,
        negativeMarking: assessment.negativeMarking,
        submittedAt: attempt.submittedAt,
        sections,
      },
    });
  })
);

/** Read one attempt back. Used by the result view. */
attemptsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        userId: true,
        assessmentId: true,
        startedAt: true,
        submittedAt: true,
        answers: true,
        score: true,
        maxScore: true,
        correctCount: true,
        wrongCount: true,
        unansweredCount: true,
      },
    });
    if (!attempt || attempt.userId !== req.userId!) {
      return res.status(404).json({ error: "Attempt not found" });
    }
    const { userId, ...rest } = attempt;
    res.json({ attempt: rest });
  })
);
