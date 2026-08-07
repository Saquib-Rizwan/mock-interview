/**
 * Builds the company → role → round catalogue from a declarative file, and
 * fills each round with questions.
 *
 *   npm run seed:catalog --workspace backend -- ../data/catalog.json
 *
 * The catalogue file is the source of truth: this script reconciles the
 * database to match it, adding what is missing and detaching what is no longer
 * declared. That is why it can be re-run safely — the alternative, incremental
 * `attach` calls, made it impossible to say what a round *should* contain and
 * is how 51 coding questions ended up in a single round.
 *
 * Detaching only ever removes RoundQuestion rows. Questions themselves, and any
 * submissions against them, are never touched.
 *
 * Two ways a round gets questions:
 *   picks    — drawn from the shared bank by category/type. A rolling cursor per
 *              pool means consecutive rounds get *different* questions rather
 *              than every company asking the same first five.
 *   specific — company-specific questions written inline here, created if absent
 *              and attached only to this round.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/prisma";
import {
  Difficulty,
  QuestionCategory,
  QuestionType,
  RoundType,
} from "../src/generated/prisma/enums";

type Pick = {
  category: QuestionCategory;
  type?: QuestionType;
  difficulty?: Difficulty;
  count: number;
};

type SpecificQuestion = {
  text: string;
  difficulty: Difficulty;
  expectedAnswerPoints: string[];
};

type RoundSpec = {
  order: number;
  roundType: RoundType;
  roundName: string;
  notes?: string;
  picks?: Pick[];
  specific?: SpecificQuestion[];
};

type RoleSpec = { name: string; rounds: RoundSpec[] };
type CompanySpec = { name: string; roles: RoleSpec[] };

/**
 * Cursor per `category|type|difficulty` pool. Without it, every round asking for
 * "5 OS questions" would receive the same five, because each round is empty
 * before it is filled.
 */
const cursors = new Map<string, number>();

async function drawFromPool(pick: Pick): Promise<string[]> {
  const key = `${pick.category}|${pick.type ?? "any"}|${pick.difficulty ?? "any"}`;

  const pool = await prisma.question.findMany({
    where: {
      category: pick.category,
      ...(pick.type ? { questionType: pick.type } : {}),
      ...(pick.difficulty ? { difficulty: pick.difficulty } : {}),
    },
    // Ordered by id so the distribution is stable across runs — a re-seed must
    // not reshuffle which questions a student saw yesterday.
    orderBy: { id: "asc" },
    select: { id: true },
  });

  if (pool.length === 0) return [];

  const start = cursors.get(key) ?? 0;
  const taken: string[] = [];
  for (let i = 0; i < Math.min(pick.count, pool.length); i++) {
    taken.push(pool[(start + i) % pool.length].id);
  }
  cursors.set(key, (start + taken.length) % pool.length);
  return taken;
}

async function ensureSpecific(q: SpecificQuestion): Promise<string> {
  const existing = await prisma.question.findFirst({
    where: { text: q.text },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.question.create({
    data: {
      text: q.text,
      category: "company_specific",
      difficulty: q.difficulty,
      questionType: "text",
      expectedAnswerPoints: q.expectedAnswerPoints,
    },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const [, , fileArg] = process.argv;
  if (!fileArg) {
    console.error("Usage: npm run seed:catalog --workspace backend -- <catalog.json>");
    process.exit(1);
  }

  const companies = JSON.parse(
    readFileSync(resolve(process.cwd(), fileArg), "utf8")
  ) as CompanySpec[];

  let roundCount = 0;
  let attached = 0;
  let detached = 0;
  let shortfalls: string[] = [];

  for (const companySpec of companies) {
    const company = await prisma.company.upsert({
      where: { name: companySpec.name },
      create: { name: companySpec.name },
      update: {},
      select: { id: true },
    });

    for (const roleSpec of companySpec.roles) {
      const role = await prisma.role.upsert({
        where: { companyId_name: { companyId: company.id, name: roleSpec.name } },
        create: { companyId: company.id, name: roleSpec.name },
        update: {},
        select: { id: true },
      });

      for (const roundSpec of roleSpec.rounds) {
        const round = await prisma.round.upsert({
          where: { roleId_order: { roleId: role.id, order: roundSpec.order } },
          create: {
            roleId: role.id,
            order: roundSpec.order,
            roundType: roundSpec.roundType,
            roundName: roundSpec.roundName,
            notes: roundSpec.notes ?? null,
          },
          update: {
            roundType: roundSpec.roundType,
            roundName: roundSpec.roundName,
            notes: roundSpec.notes ?? null,
          },
          select: { id: true },
        });
        roundCount++;

        const wanted = new Set<string>();
        for (const q of roundSpec.specific ?? []) {
          wanted.add(await ensureSpecific(q));
        }
        for (const pick of roundSpec.picks ?? []) {
          const ids = await drawFromPool(pick);
          if (ids.length < pick.count) {
            shortfalls.push(
              `${companySpec.name} / ${roleSpec.name} / ${roundSpec.roundName}: ` +
                `wanted ${pick.count} ${pick.category}${pick.type ? " " + pick.type : ""}, got ${ids.length}`
            );
          }
          ids.forEach((id) => wanted.add(id));
        }

        const current = await prisma.roundQuestion.findMany({
          where: { roundId: round.id },
          select: { questionId: true },
        });
        const currentIds = new Set(current.map((rq) => rq.questionId));

        const toAdd = [...wanted].filter((id) => !currentIds.has(id));
        const toRemove = [...currentIds].filter((id) => !wanted.has(id));

        if (toAdd.length > 0) {
          await prisma.roundQuestion.createMany({
            data: toAdd.map((questionId) => ({ roundId: round.id, questionId })),
          });
          attached += toAdd.length;
        }
        if (toRemove.length > 0) {
          // Only the join rows go. The questions stay in the bank, and any
          // submissions made against them are untouched.
          await prisma.roundQuestion.deleteMany({
            where: { roundId: round.id, questionId: { in: toRemove } },
          });
          detached += toRemove.length;
        }
      }
    }
  }

  console.log(`Seeded ${companies.length} companies, ${roundCount} rounds`);
  console.log(`  attached: ${attached}`);
  console.log(`  detached: ${detached}`);
  if (shortfalls.length > 0) {
    console.log(`\n${shortfalls.length} round(s) could not be filled as requested:`);
    shortfalls.forEach((s) => console.log("  " + s));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
