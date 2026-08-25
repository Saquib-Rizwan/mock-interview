import { prisma } from "../prisma";

/**
 * Which of `questionIds` this user has attempted at least once.
 *
 * "Attempted" means a written `Submission` or a `CodeSubmission` exists. The two
 * live in separate tables — deliberately, see the schema comment on
 * `CodeSubmission` — so both have to be asked, and a round mixing text and
 * coding questions needs the union of them.
 *
 * Neither is filtered on score. This answers "have you been here", not "did you
 * do well"; the progress page is what grades. Keeping the distinction means the
 * round spine can be honest about coverage without implying mastery.
 *
 * Two queries rather than a join per round: the id lists are small (a round
 * holds single digits of questions, a role a few dozen) and `distinct` pushes
 * the deduplication into Postgres, so this stays flat as the catalogue grows.
 */
export async function attemptedQuestionIds(
  userId: string,
  questionIds: string[]
): Promise<Set<string>> {
  // `in: []` is a valid but wasteful round trip, and Aays' resume-screening
  // round genuinely has no questions at all.
  if (questionIds.length === 0) return new Set();

  const where = { userId, questionId: { in: questionIds } };

  const [written, coded] = await Promise.all([
    prisma.submission.findMany({
      where,
      select: { questionId: true },
      distinct: ["questionId"],
    }),
    prisma.codeSubmission.findMany({
      where,
      select: { questionId: true },
      distinct: ["questionId"],
    }),
  ]);

  return new Set([...written, ...coded].map((row) => row.questionId));
}
