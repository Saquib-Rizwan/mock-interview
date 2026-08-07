import { Router } from "express";
import { asyncHandler } from "../asyncHandler";
import { requireAuth } from "../auth/middleware";
import { prisma } from "../prisma";
import type { CodingLanguage, QuestionCategory } from "../generated/prisma/enums";

export const progressRouter = Router();

progressRouter.use(requireAuth);

/** Shape of the per-point verdicts stored on Submission.points. */
type PointVerdict = { point: string; covered: boolean; comment: string };

/** Older submissions predate the points column; treat anything unexpected as absent. */
function readPoints(value: unknown): PointVerdict[] | null {
  if (!Array.isArray(value)) return null;
  const points = value.filter(
    (p): p is PointVerdict =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as PointVerdict).point === "string" &&
      typeof (p as PointVerdict).covered === "boolean"
  );
  return points.length > 0 ? points : null;
}

/** How many gaps to surface. Beyond this it stops being a to-do list. */
const MAX_RECURRING_GAPS = 8;
const MAX_RECENT = 12;

/**
 * Everything the progress page needs, in one request.
 *
 * Aggregated in JavaScript rather than SQL. The queries are scoped to a single
 * user's own submissions, so the volumes are small, and the alternative — half
 * a dozen raw GROUP BY queries — would be considerably harder to read for no
 * measurable gain. If a single user ever accumulates enough submissions for
 * this to matter, that is the point to move it into SQL.
 */
progressRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.userId!;

    const [textSubs, codeSubs, roles] = await Promise.all([
      prisma.submission.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          questionId: true,
          createdAt: true,
          points: true,
          question: { select: { text: true, category: true } },
        },
      }),
      prisma.codeSubmission.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          questionId: true,
          createdAt: true,
          language: true,
          passedCount: true,
          totalCount: true,
          question: { select: { text: true, category: true } },
        },
      }),
      // The catalogue side: what each role asks, so "attempted" can be
      // expressed as a fraction of something.
      prisma.role.findMany({
        select: {
          id: true,
          name: true,
          company: { select: { id: true, name: true } },
          rounds: {
            select: { questions: { select: { questionId: true } } },
          },
        },
        orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      }),
    ]);

    // ---- totals -------------------------------------------------------------

    const textQuestionIds = new Set(textSubs.map((s) => s.questionId));
    const codeQuestionIds = new Set(codeSubs.map((s) => s.questionId));
    const solvedQuestionIds = new Set(
      codeSubs.filter((s) => s.totalCount > 0 && s.passedCount === s.totalCount).map((s) => s.questionId)
    );

    // ---- per-subject coverage ----------------------------------------------

    // Text answers contribute a coverage percentage; coding questions contribute
    // a pass rate. They are different measurements, so a subject reports
    // whichever applies rather than blending them into one meaningless number.
    const subjects = new Map<
      QuestionCategory,
      { attempts: number; scored: number; covered: number; totalPoints: number }
    >();

    for (const sub of textSubs) {
      const cat = sub.question.category;
      const entry =
        subjects.get(cat) ?? { attempts: 0, scored: 0, covered: 0, totalPoints: 0 };
      entry.attempts++;
      const points = readPoints(sub.points);
      if (points) {
        entry.scored++;
        entry.covered += points.filter((p) => p.covered).length;
        entry.totalPoints += points.length;
      }
      subjects.set(cat, entry);
    }

    const subjectRows = [...subjects.entries()]
      .map(([category, e]) => ({
        category,
        attempts: e.attempts,
        scoredAttempts: e.scored,
        // Null, not zero, when nothing is scored yet: "no data" and "you scored
        // 0%" must not look the same on a page whose whole job is telling you
        // where you stand.
        coveragePct: e.totalPoints > 0 ? Math.round((e.covered / e.totalPoints) * 100) : null,
      }))
      // Weakest first — that is the actionable ordering. Unscored subjects go
      // last, since they are not a weakness, just unknown.
      .sort((a, b) => {
        if (a.coveragePct === null) return 1;
        if (b.coveragePct === null) return -1;
        return a.coveragePct - b.coveragePct;
      });

    // ---- coding by language -------------------------------------------------

    const langs = new Map<CodingLanguage, { attempts: number; solved: number; passed: number; total: number }>();
    for (const sub of codeSubs) {
      const entry = langs.get(sub.language) ?? { attempts: 0, solved: 0, passed: 0, total: 0 };
      entry.attempts++;
      if (sub.totalCount > 0 && sub.passedCount === sub.totalCount) entry.solved++;
      entry.passed += sub.passedCount;
      entry.total += sub.totalCount;
      langs.set(sub.language, entry);
    }

    const languageRows = [...langs.entries()]
      .map(([language, e]) => ({
        language,
        attempts: e.attempts,
        solved: e.solved,
        testPassRatePct: e.total > 0 ? Math.round((e.passed / e.total) * 100) : null,
      }))
      .sort((a, b) => b.attempts - a.attempts);

    // ---- recurring gaps -----------------------------------------------------

    // The most useful thing on the page: not "you scored 62%" but "you have
    // missed this specific point in four of your last five attempts".
    const gaps = new Map<string, { missed: number; seen: number; category: QuestionCategory }>();
    for (const sub of textSubs) {
      const points = readPoints(sub.points);
      if (!points) continue;
      for (const p of points) {
        const entry = gaps.get(p.point) ?? { missed: 0, seen: 0, category: sub.question.category };
        entry.seen++;
        if (!p.covered) entry.missed++;
        gaps.set(p.point, entry);
      }
    }

    const recurringGaps = [...gaps.entries()]
      .filter(([, e]) => e.missed > 0)
      .map(([point, e]) => ({ point, missed: e.missed, seen: e.seen, category: e.category }))
      .sort((a, b) => b.missed - a.missed || b.seen - a.seen)
      .slice(0, MAX_RECURRING_GAPS);

    // ---- readiness per role -------------------------------------------------

    const attemptedIds = new Set([...textQuestionIds, ...codeQuestionIds]);

    const readiness = roles
      .map((role) => {
        const questionIds = new Set(
          role.rounds.flatMap((r) => r.questions.map((q) => q.questionId))
        );
        const attempted = [...questionIds].filter((id) => attemptedIds.has(id)).length;
        return {
          companyId: role.company.id,
          companyName: role.company.name,
          roleId: role.id,
          roleName: role.name,
          totalQuestions: questionIds.size,
          attempted,
          pct: questionIds.size > 0 ? Math.round((attempted / questionIds.size) * 100) : 0,
        };
      })
      .filter((r) => r.totalQuestions > 0)
      // Most-progressed first, so the roles you are actually working towards
      // rise to the top instead of being buried alphabetically.
      .sort((a, b) => b.pct - a.pct || a.companyName.localeCompare(b.companyName));

    // ---- recent activity ----------------------------------------------------

    const recent = [
      ...textSubs.map((s) => {
        const points = readPoints(s.points);
        return {
          kind: "text" as const,
          id: s.id,
          questionId: s.questionId,
          questionText: s.question.text,
          category: s.question.category,
          createdAt: s.createdAt,
          covered: points ? points.filter((p) => p.covered).length : null,
          total: points ? points.length : null,
        };
      }),
      ...codeSubs.map((s) => ({
        kind: "coding" as const,
        id: s.id,
        questionId: s.questionId,
        questionText: s.question.text,
        category: s.question.category,
        createdAt: s.createdAt,
        covered: s.passedCount,
        total: s.totalCount,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, MAX_RECENT);

    res.json({
      progress: {
        totals: {
          textQuestions: textQuestionIds.size,
          textAttempts: textSubs.length,
          codingQuestions: codeQuestionIds.size,
          codingSolved: solvedQuestionIds.size,
          codingAttempts: codeSubs.length,
        },
        subjects: subjectRows,
        languages: languageRows,
        recurringGaps,
        readiness,
        recent,
      },
    });
  })
);
