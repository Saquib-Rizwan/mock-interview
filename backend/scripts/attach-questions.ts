/**
 * Attaches existing general-bank questions to a round via the RoundQuestion
 * join table. Admin tooling — there is no UI for this yet.
 *
 *   List rounds so you can find an id:
 *     npm run attach --workspace backend -- --list
 *
 *   Attach 5 OS questions to a round:
 *     npm run attach --workspace backend -- --round <roundId> --category os --count 5
 *
 *   Attach specific questions:
 *     npm run attach --workspace backend -- --round <roundId> --ids <id1>,<id2>
 *
 * Optional filter: --difficulty easy|medium|hard
 */
// Must come before the prisma import: these scripts do not go through
// src/index.ts, which is what normally loads .env.
import "dotenv/config";
import { prisma } from "../src/prisma";
import { Difficulty, QuestionCategory } from "../src/generated/prisma/enums";

const CATEGORIES = Object.values(QuestionCategory) as string[];
const DIFFICULTIES = Object.values(Difficulty) as string[];

function parseArgs(argv: string[]): Record<string, string | true> {
  const args: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function listRounds() {
  const rounds = await prisma.round.findMany({
    orderBy: [{ role: { company: { name: "asc" } } }, { order: "asc" }],
    select: {
      id: true,
      order: true,
      roundName: true,
      roundType: true,
      _count: { select: { questions: true } },
      role: { select: { name: true, company: { select: { name: true } } } },
    },
  });

  if (rounds.length === 0) {
    console.log("No rounds found. Run `npm run db:seed` first.");
    return;
  }

  console.log("Rounds:\n");
  for (const r of rounds) {
    console.log(`  ${r.id}`);
    console.log(
      `    ${r.role.company.name} / ${r.role.name} / ${r.order}. ${r.roundName} ` +
        `[${r.roundType}] — ${r._count.questions} question(s)\n`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    await listRounds();
    return;
  }

  const roundId = typeof args.round === "string" ? args.round : null;
  if (!roundId) {
    console.error(
      "Usage:\n" +
        "  --list                                  show all rounds and their ids\n" +
        "  --round <id> --category <cat> [--count n] [--difficulty d]\n" +
        "  --round <id> --ids <id1,id2,...>"
    );
    process.exit(1);
  }

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: {
      id: true,
      roundName: true,
      role: { select: { name: true, company: { select: { name: true } } } },
    },
  });
  if (!round) {
    console.error(`Round not found: ${roundId}`);
    process.exit(1);
  }

  // Already-attached questions are excluded up front. The composite primary key
  // on RoundQuestion would reject them anyway, but failing the whole batch on a
  // re-run would make this script annoying to use.
  const alreadyAttached = await prisma.roundQuestion.findMany({
    where: { roundId },
    select: { questionId: true },
  });
  const attachedIds = new Set(alreadyAttached.map((rq) => rq.questionId));

  let candidates: { id: string; text: string; category: string }[];

  if (typeof args.ids === "string") {
    const ids = args.ids.split(",").map((s) => s.trim()).filter(Boolean);
    candidates = await prisma.question.findMany({
      where: { id: { in: ids } },
      select: { id: true, text: true, category: true },
    });

    const found = new Set(candidates.map((q) => q.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      console.error(`These question ids do not exist:\n  ${missing.join("\n  ")}`);
      process.exit(1);
    }
  } else {
    const category = typeof args.category === "string" ? args.category : null;
    if (!category || !CATEGORIES.includes(category)) {
      console.error(`--category must be one of: ${CATEGORIES.join(", ")}`);
      process.exit(1);
    }

    const difficulty = typeof args.difficulty === "string" ? args.difficulty : null;
    if (difficulty && !DIFFICULTIES.includes(difficulty)) {
      console.error(`--difficulty must be one of: ${DIFFICULTIES.join(", ")}`);
      process.exit(1);
    }

    const count = args.count ? Number(args.count) : 5;
    if (!Number.isInteger(count) || count < 1) {
      console.error("--count must be a positive whole number");
      process.exit(1);
    }

    candidates = await prisma.question.findMany({
      where: {
        category: category as QuestionCategory,
        ...(difficulty ? { difficulty: difficulty as Difficulty } : {}),
        // Never pull a question that is already in this round.
        id: { notIn: [...attachedIds] },
      },
      take: count,
      select: { id: true, text: true, category: true },
    });

    if (candidates.length === 0) {
      console.log("No unattached questions matched those filters.");
      return;
    }
    if (candidates.length < count) {
      console.log(
        `Note: only ${candidates.length} matching question(s) available, asked for ${count}.`
      );
    }
  }

  const toAttach = candidates.filter((q) => !attachedIds.has(q.id));
  const skipped = candidates.length - toAttach.length;

  if (toAttach.length > 0) {
    await prisma.roundQuestion.createMany({
      data: toAttach.map((q) => ({ roundId, questionId: q.id })),
    });
  }

  console.log(
    `Round: ${round.role.company.name} / ${round.role.name} / ${round.roundName}\n`
  );
  console.log(`  attached: ${toAttach.length}`);
  if (skipped > 0) console.log(`  skipped (already attached): ${skipped}`);
  for (const q of toAttach) {
    console.log(`    [${q.category}] ${q.text.slice(0, 70)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
