# Phase 1 — Core Schema (Company / Role / Round / Question)

Status: ready for review.

## What was implemented

- **`backend/prisma/schema.prisma`** — 5 models (`Company`, `Role`, `Round`, `Question`, `RoundQuestion`) and 4 enums (`RoundType`, `QuestionCategory`, `QuestionType`, `Difficulty`).
- **`backend/prisma/migrations/20260802164213_init_core_schema/`** — the generated SQL migration, applied to the local database.
- **`backend/prisma/seed.ts`** — re-runnable seed: 2 companies, 2 roles, 6 rounds, 13 questions, 14 round↔question links.
- **`backend/prisma.config.ts`** — registered `seed: "tsx prisma/seed.ts"` so `prisma db seed` knows what to run.
- **`backend/package.json`** — added `db:seed`, `db:reset`, `db:studio` scripts.
- Prisma client regenerated into `backend/src/generated/prisma/` (gitignored).

Nothing in `src/index.ts` changed — the API still exposes only the Phase 0 health endpoints. Reading this data over HTTP is Phase 3.

## Why this approach

**Enums, not lookup tables** — as specified. Adding a round type is a one-line schema change plus a migration, with no join needed to read a round's type.

**Snake_case table and column names** (`round_question`, `company_id`, `order_index`). Prisma's default would create `"RoundQuestion"` with capitals, and PostgreSQL folds unquoted identifiers to lowercase — so every raw SQL query would need `SELECT * FROM "RoundQuestion"` with explicit quotes. Since the acceptance criterion for this phase is *querying the database directly*, the mapping buys real ergonomics. Prisma model/field names stay PascalCase/camelCase as is idiomatic in TypeScript; `@map`/`@@map` bridges the two.

**`order` field mapped to column `order_index`.** `ORDER` is a reserved SQL keyword. The Prisma-side field is still called `order` for readability.

**`expectedAnswerPoints` is `String[]`** (a native PostgreSQL text array), not a single text blob and not JSON. Phase 4 hands the LLM a checklist of discrete points to check the student's answer against; storing them pre-split means neither the backend nor the LLM has to parse prose back into items. Chose a native array over `Json` because the shape is genuinely just a list of strings — `Json` would accept any shape and lose that guarantee.

**UUID primary keys** (your call). These appear in URLs from Phase 3 onward, and sequential integers would let anyone enumerate `/company/1`, `/company/2` and infer how much data exists.

**Difficulty as an enum** (your call) rather than an integer — the database itself rejects invalid values, and the stored value displays directly in the UI with no lookup.

**Cascade rules are deliberately asymmetric:**
- `Role → Company`, `Round → Role`, `RoundQuestion → Round` all cascade on delete. Deleting a company should clean up its whole tree; none of those rows mean anything without their parent.
- `RoundQuestion → Question` uses `onDelete: Restrict` instead. General-bank questions are shared across companies, so deleting a question that is still attached to rounds is almost certainly a mistake — the database refuses rather than silently stripping it from every round. This is the one place I chose the stricter option, because Phase 5 bulk-loads questions and a bad bulk delete would otherwise be quiet and unrecoverable.

**Unique constraints:**
- `Company.name` — prevents duplicate companies.
- `(companyId, name)` on `Role` — "Analyst" can exist at two companies but not twice at one.
- `(roleId, order)` on `Round` — a role cannot have two round 2s. Since ordering is explicit and meaningful, letting duplicates in would make the sequence ambiguous.

**Seed wipes then inserts**, rather than upserting. Questions have no natural unique key (text is long and may legitimately repeat with different categories), so upserting would need synthetic keys that exist only to serve the seed. Delete-then-insert keeps the seed re-runnable, which matters more during development.

## How it works

```
Company ──1:N──► Role ──1:N──► Round ──┐
                                       ├─N:M─► Question
                              (via round_question)
```

`RoundQuestion` is the join table making the many-to-many work. Its primary key is the composite `(round_id, question_id)`, which both prevents attaching the same question to a round twice and gives the join an index for free.

That table is the whole reason a general OS question and a TCS-specific question can sit side by side in one round: neither is owned by the round, both are merely *referenced* by it. The seed proves this concretely — `"Tell me about yourself."` is a single `question` row referenced by both TCS's and Deloitte's HR rounds. Editing that one row updates it everywhere.

### Seeded shapes (deliberately mismatched)

| Company | Role | Rounds |
|---|---|---|
| TCS | Systems Engineer | 1 aptitude → 2 technical → 3 **coding** → 4 hr |
| Deloitte | Business Analyst | 1 group_discussion → 2 hr — **no coding, no aptitude** |

Different round counts, different types, different starting round. Nothing in the schema knows or cares that one has four rounds and the other two.

The 13 questions span `company_specific`, `os`, `cn`, `dbms`, `dsa`, `general_hr` and `other`. One is `questionType: coding` (reverse a linked list), attached to the TCS coding round.

## Known limitations / things deferred

- **No API exposes any of this.** Phase 3 adds the read endpoints; right now the only way in is SQL or Prisma Studio.
- **Coding questions have no test cases.** `dsaReverseList` is marked `questionType: coding` but has no input/expected-output rows — that schema extension is explicitly Phase 6.
- **`Difficulty` is fixed at three levels.** Adding `expert` later means a migration. Acceptable; the alternative (integers) trades away validation for flexibility we don't need yet.
- **No `Submission` table and no `User` table.** Phases 4 and 2 respectively.
- **Seed data is illustrative, not researched.** The TCS and Deloitte round structures are plausible examples to prove the schema handles variety — they are not verified against those companies' actual current processes. Treat them as fixtures, not facts.
- **`expectedAnswerPoints` has no length or count validation.** Nothing stops an empty array. Worth a check when Phase 5 bulk-ingests questions from documents.
- **The seed deletes all existing data when run.** Fine now; once real user submissions exist (Phase 4), running it would destroy them. It will need a guard before then — noted here so it is not forgotten.
- **No indexes beyond primary keys, unique constraints and foreign keys.** Correct at this data volume; revisit if question-bank queries slow down after Phase 5.

## How to verify it works

Prerequisite: the database container is running (`docker compose up -d` from the repo root). All commands below run from `d:\mock-interview\backend`.

### Option A — the visual way (easiest)

```
npm run db:studio
```

Prisma Studio opens a browser tab at `localhost:5555` — a spreadsheet-style view of every table. Click `company` → you'll see TCS and Deloitte; click into the related rows to walk the tree. `Ctrl+C` in the terminal closes it.

This is the fastest way to *see* the structure. The SQL below proves the same thing more precisely.

### Option B — SQL

Each command uses `docker exec -i mock-interview-db-1 psql -U mockinterview -d mockinterview -c "<SQL>"`. Breaking that down once: `docker exec` runs a command inside the running container; `-i` keeps input open; `psql` is Postgres's built-in command-line client; `-U` is the user and `-d` the database (both `mockinterview`); `-c` runs one SQL statement and exits.

**1. The two trees, side by side — the core acceptance check**

```
docker exec -i mock-interview-db-1 psql -U mockinterview -d mockinterview -c "SELECT c.name AS company, ro.name AS role, r.order_index AS ord, r.round_type, r.round_name, count(rq.question_id) AS questions FROM company c JOIN role ro ON ro.company_id=c.id JOIN round r ON r.role_id=ro.id LEFT JOIN round_question rq ON rq.round_id=r.id GROUP BY c.name, ro.name, r.order_index, r.round_type, r.round_name ORDER BY c.name, r.order_index;"
```

Expect exactly 6 rows — Deloitte with 2 rounds (group_discussion, hr) and TCS with 4 (aptitude, technical, coding, hr), each with a question count. Different row counts per company is the point: the schema holds both shapes with no special-casing.

**2. Company-specific and general-bank questions inside one round**

```
docker exec -i mock-interview-db-1 psql -U mockinterview -d mockinterview -c "SELECT q.category, left(q.text,46) AS question FROM round r JOIN role ro ON ro.id=r.role_id JOIN company c ON c.id=ro.company_id JOIN round_question rq ON rq.round_id=r.id JOIN question q ON q.id=rq.question_id WHERE c.name='Deloitte' AND r.order_index=2 ORDER BY q.category;"
```

Expect 4 rows in Deloitte's HR round: one `company_specific`, plus `cn`, `dbms` and `general_hr` from the shared bank — mixed together, which is what the join table exists for.

**3. One question reused by two companies**

```
docker exec -i mock-interview-db-1 psql -U mockinterview -d mockinterview -c "SELECT left(q.text,30) AS question, string_agg(DISTINCT c.name, ', ') AS used_by FROM question q JOIN round_question rq ON rq.question_id=q.id JOIN round r ON r.id=rq.round_id JOIN role ro ON ro.id=r.role_id JOIN company c ON c.id=ro.company_id GROUP BY q.id, q.text HAVING count(DISTINCT c.name) > 1;"
```

Expect exactly one row: `Tell me about yourself.` used by `Deloitte, TCS`. One row in the database, referenced twice.

**4. Answer points really are an array**

```
docker exec -i mock-interview-db-1 psql -U mockinterview -d mockinterview -c "SELECT array_length(expected_answer_points,1) AS n_points, expected_answer_points[1] AS first_point FROM question WHERE category='os';"
```

Expect counts of 5 and 6, with the first point printed. `array_length` would error on plain text — that it works confirms real array storage.

**5. The constraints actually bite**

```
docker exec -i mock-interview-db-1 psql -U mockinterview -d mockinterview -c "INSERT INTO company (id, name) VALUES ('11111111-1111-1111-1111-111111111111','TCS');"
```

This **should fail** with `duplicate key value violates unique constraint`. A failure here is the correct result — it proves the database rejects duplicate companies rather than trusting application code to remember.

### Resetting the data

```
npm run db:seed
```

Re-runs the seed. It wipes and reinserts, so it's safe to run repeatedly — you should see the same counts every time: `{ companies: 2, roles: 2, rounds: 6, questions: 13, links: 14 }`.

```
npm run db:reset
```

The heavier option: drops the entire database, re-applies every migration from scratch, then seeds. Use if the schema and database ever fall out of sync. It **will prompt for confirmation** because it destroys all data — that prompt is expected, not an error.

## What I verified myself

Ran and confirmed: the migration applied cleanly; all five verification queries above return the stated results; the seed produces identical counts when run twice (idempotent); `npm run build` compiles with no TypeScript errors against the regenerated client.

Not verified: nothing in this phase is user-visible, so there is no UI check to do. Prisma Studio is offered above for convenience rather than as a gap in my testing.
