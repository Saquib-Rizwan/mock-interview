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

/** One timed section of an assessment. Questions are drawn from the MCQ pools. */
type SectionSpec = {
  name: string;
  durationMin?: number;
  marksPerQuestion?: number;
  picks: Pick[];
};

/**
 * Present only on rounds that are timed tests rather than conversations.
 * Its presence is what makes the round an assessment round — there is no
 * separate mode flag; see phase-10-mcq-assessments.md.
 */
type AssessmentSpec = {
  totalDurationMin?: number;
  negativeMarking?: number;
  canRevisit?: boolean;
  sections: SectionSpec[];
};

type RoundSpec = {
  order: number;
  roundType: RoundType;
  roundName: string;
  notes?: string;
  picks?: Pick[];
  specific?: SpecificQuestion[];
  assessment?: AssessmentSpec;
};

type RoleSpec = {
  name: string;
  /**
   * Eligibility, optional because most catalogue entries predate the placement
   * material and genuinely have none stated. Omitting these is meaningful: it
   * records that the source was silent, which is not the same as saying anyone
   * may apply. See the comment on Role in schema.prisma.
   */
  eligibleBranches?: string[];
  openToAllBranches?: boolean;
  minCgpa?: number;
  rounds: RoundSpec[];
};
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
  let assessmentCount = 0;
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
        create: {
          companyId: company.id,
          name: roleSpec.name,
          eligibleBranches: roleSpec.eligibleBranches ?? [],
          openToAllBranches: roleSpec.openToAllBranches ?? false,
          minCgpa: roleSpec.minCgpa ?? null,
        },
        // Rewritten on every seed, not left alone: the JSON is the source of
        // truth for eligibility, so correcting a CGPA cutoff in the file has to
        // reach the database on the next run.
        update: {
          eligibleBranches: roleSpec.eligibleBranches ?? [],
          openToAllBranches: roleSpec.openToAllBranches ?? false,
          minCgpa: roleSpec.minCgpa ?? null,
        },
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

        // The assessment is additive: a round keeps its written practice
        // questions AND gains a timed test. Replacing one with the other would
        // have removed working functionality from three existing rounds.
        if (roundSpec.assessment) {
          const spec = roundSpec.assessment;
          const assessment = await prisma.assessment.upsert({
            where: { roundId: round.id },
            create: {
              roundId: round.id,
              totalDurationMin: spec.totalDurationMin ?? null,
              negativeMarking: spec.negativeMarking ?? null,
              canRevisit: spec.canRevisit ?? true,
            },
            update: {
              totalDurationMin: spec.totalDurationMin ?? null,
              negativeMarking: spec.negativeMarking ?? null,
              canRevisit: spec.canRevisit ?? true,
            },
            select: { id: true },
          });
          assessmentCount++;

          for (const [i, sectionSpec] of spec.sections.entries()) {
            const section = await prisma.assessmentSection.upsert({
              where: {
                assessmentId_order: { assessmentId: assessment.id, order: i + 1 },
              },
              create: {
                assessmentId: assessment.id,
                order: i + 1,
                name: sectionSpec.name,
                durationMin: sectionSpec.durationMin ?? null,
                marksPerQuestion: sectionSpec.marksPerQuestion ?? 1,
              },
              update: {
                name: sectionSpec.name,
                durationMin: sectionSpec.durationMin ?? null,
                marksPerQuestion: sectionSpec.marksPerQuestion ?? 1,
              },
              select: { id: true },
            });

            const picked: string[] = [];
            for (const pick of sectionSpec.picks) {
              // Same rolling cursor as the written pools, so two sections do
              // not silently receive the same questions.
              const ids = await drawFromPool({ ...pick, type: "mcq" });
              if (ids.length < pick.count) {
                shortfalls.push(
                  `${companySpec.name} / ${roleSpec.name} / ${roundSpec.roundName} / ` +
                    `${sectionSpec.name}: wanted ${pick.count} ${pick.category} mcq, got ${ids.length}`
                );
              }
              ids.forEach((id) => {
                if (!picked.includes(id)) picked.push(id);
              });
            }

            // Rewritten wholesale rather than diffed: order matters here in a
            // way it does not for a round listing, and an existing row with a
            // stale order_index would collide with the unique index.
            await prisma.assessmentQuestion.deleteMany({
              where: { sectionId: section.id },
            });
            if (picked.length > 0) {
              await prisma.assessmentQuestion.createMany({
                data: picked.map((questionId, order) => ({
                  sectionId: section.id,
                  questionId,
                  order: order + 1,
                })),
              });
            }
          }
        }
      }
    }
  }

  console.log(
    `Seeded ${companies.length} companies, ${roundCount} rounds, ` +
      `${assessmentCount} assessment(s)`
  );
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
