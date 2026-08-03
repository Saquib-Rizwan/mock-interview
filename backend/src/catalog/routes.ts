import { Router } from "express";
import { asyncHandler } from "../asyncHandler";
import { requireAuth } from "../auth/middleware";
import { prisma } from "../prisma";

// Read-only browsing of the company -> role -> round -> question tree.
// Every route requires a logged-in user; there is no public catalogue.
export const catalogRouter = Router();

catalogRouter.use(requireAuth);

catalogRouter.get(
  "/companies",
  asyncHandler(async (_req, res) => {
    const companies = await prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { roles: true } } },
    });

    res.json({
      companies: companies.map(({ id, name, _count }) => ({
        id,
        name,
        roleCount: _count.roles,
      })),
    });
  })
);

catalogRouter.get(
  "/companies/:id",
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        roles: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, _count: { select: { rounds: true } } },
        },
      },
    });

    if (!company) return res.status(404).json({ error: "Company not found" });

    res.json({
      company: {
        id: company.id,
        name: company.name,
        roles: company.roles.map(({ id, name, _count }) => ({
          id,
          name,
          roundCount: _count.rounds,
        })),
      },
    });
  })
);

catalogRouter.get(
  "/roles/:id",
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        company: { select: { id: true, name: true } },
        rounds: {
          // Explicit sequence, never insertion order.
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            roundType: true,
            roundName: true,
            notes: true,
            _count: { select: { questions: true } },
          },
        },
      },
    });

    if (!role) return res.status(404).json({ error: "Role not found" });

    res.json({
      role: {
        id: role.id,
        name: role.name,
        company: role.company,
        rounds: role.rounds.map(({ _count, ...round }) => ({
          ...round,
          questionCount: _count.questions,
        })),
      },
    });
  })
);

// Single question, for the answering page. expectedAnswerPoints stays server
// side for the same reason as in the round listing: it is the answer key.
catalogRouter.get(
  "/questions/:id",
  asyncHandler(async (req, res) => {
    const question = await prisma.question.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        text: true,
        category: true,
        difficulty: true,
        questionType: true,
        // Count only, so the UI can say "graded against 5 points" without
        // revealing what they are.
        expectedAnswerPoints: true,
      },
    });

    if (!question) return res.status(404).json({ error: "Question not found" });

    const { expectedAnswerPoints, ...rest } = question;
    res.json({ question: { ...rest, expectedPointCount: expectedAnswerPoints.length } });
  })
);

catalogRouter.get(
  "/rounds/:id",
  asyncHandler(async (req, res) => {
    const round = await prisma.round.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        order: true,
        roundType: true,
        roundName: true,
        notes: true,
        role: {
          select: { id: true, name: true, company: { select: { id: true, name: true } } },
        },
        questions: {
          select: {
            question: {
              select: {
                id: true,
                text: true,
                category: true,
                difficulty: true,
                questionType: true,
                // expectedAnswerPoints is deliberately omitted: it is the
                // answer key, and this is a practice catalogue. Phase 4 uses it
                // server-side for grading.
              },
            },
          },
        },
      },
    });

    if (!round) return res.status(404).json({ error: "Round not found" });

    const { questions, ...rest } = round;

    res.json({
      round: {
        ...rest,
        // Flatten the join rows into plain questions. Company-specific and
        // general-bank questions come back together, indistinguishable except
        // by their category.
        questions: questions.map((rq) => rq.question),
      },
    });
  })
);
