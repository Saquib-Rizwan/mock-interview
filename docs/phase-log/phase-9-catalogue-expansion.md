# Phase 9 — Catalogue expansion

Status: **groundwork done — schema, migrations and the LeetCode importer.**
No questions authored yet; that waits on source material.

The insight that shapes the phase: **company breadth multiplies against pool
depth.** The pools were 15 questions each in `os`, `dbms`, `cn`, `oops`,
`general_hr`, and 8 in `other`. Ten companies and 13 roles already drew from
those same 15, so adding companies alone would have shown every student the same
questions. Companies and questions grow together or not at all.

---

## 1. Aptitude became its own category

Previously aptitude questions lived in `other`, which made the thinnest pool in
the catalogue look deeper than it was and left aptitude unfilterable.

Four things had to move together, because `QuestionCategory` is duplicated
across the stack:

| File | Change |
|---|---|
| `prisma/schema.prisma` | `aptitude` added to the `QuestionCategory` enum |
| `frontend/src/api.ts` | same value added to the duplicated union |
| `frontend/src/components/labels.ts` | `CATEGORY_LABELS.aptitude` — without it the label lookup returns `undefined` |
| `data/catalog.json`, `data/questions/hr-aptitude.json` | 17 `"category": "other"` occurrences reassigned |

### Why this is two migrations, not one

`20260812130633_add_aptitude_category_and_coding_patterns` adds the enum value
and the new column. `20260812131500_reassign_aptitude_questions` moves the rows.

They cannot be combined: **Postgres will not let a newly added enum value be
used in the same transaction that adds it.** A single migration doing
`ALTER TYPE ... ADD VALUE` followed by `UPDATE ... SET category = 'aptitude'`
fails at the UPDATE.

### The row that must not move

The data migration reads:

```sql
UPDATE "question" SET "category" = 'aptitude'
WHERE "category" = 'other' AND "text" NOT ILIKE 'Group discussion:%';
```

That exclusion is load-bearing. At migration time `other` held **10** rows, not
the 8 the JSON files accounted for. Nine were aptitude; one was not:

> "Group discussion: Is remote work sustainable for entry-level employees?"

A blanket `WHERE category = 'other'` would have silently mislabelled it. `other`
is expected to still contain exactly one row, and it does.

### Two orphan rows

The 10-vs-8 discrepancy is worth recording: **two questions exist in the
database but in no file under `data/`** — ingested from files that have since
changed. Updating the JSON alone would not have moved them, which is why the
reassignment runs as SQL against the live table rather than relying on
re-ingestion. Re-running `npm run ingest` will not recreate them.

Verified after migrating: `dsa 67, cn 17, os 17, dbms 17, oops 15, general_hr
15, aptitude 9, company_specific 6, other 1`.

## 2. Pattern tags on coding questions

`CodingSpec` gained `patterns String[] @default([])` — e.g.
`["sliding-window", "hash-table"]`.

This is what makes *"give me more questions like this one"* a filter rather than
a similarity model. The reasoning, since a model was the obvious alternative:

- The taxonomy is **small and already named** — roughly 18 patterns (sliding
  window, two pointers, binary search, backtracking, intervals, and so on).
- When the categories are known, **tags beat embeddings on every axis that
  matters**: deterministic, reviewable, debuggable, no vector store, no
  inference cost, no migration beyond a column.
- The tags are **not hand-assigned** — they come from LeetCode's own `topicTags`
  via the importer below, so the usual argument for embeddings (hand-tagging
  does not scale) does not apply.

Embeddings still have a real use here, just not this one: **grouping recurring
gaps by meaning.** That feature currently matches expected-answer points on
exact text, so two near-identical missed points count separately. That is the
case to build a model for.

Ingestion populates the field via `scripts/ingest-coding.ts`; it is optional, so
the 66 questions authored before it existed remain valid and simply untagged.

## 3. The LeetCode importer

`backend/scripts/import-leetcode.ts`, wired as `npm run import:leetcode`:

```
npm run import:leetcode two-sum valid-parentheses
```

Adding a coding question by hand means writing nine fields. Six are mechanical
and LeetCode's public GraphQL endpoint already knows them, so the importer
fetches those and leaves the authoring effort for the parts needing judgement.

| Field | Source |
|---|---|
| Difficulty | API |
| Function name, param types, return type | API `metaData` |
| Starter code — Python, JavaScript, C++, Java | **Generated from `metaData`** |
| Pattern tags | API `topicTags` |
| Sample test **inputs** | API `exampleTestcases` |
| Statement | API, as reference only — must be reworded |
| Expected outputs | `npm run expected` |
| Hidden test cases | Authored |
| Reference solution | Authored |

**Starter code is generated, not copied.** LeetCode's own snippets wrap the
function in a `Solution` class; this harness calls a bare function. Generating
from `metaData` also guarantees the output matches existing conventions — the
generated `mergeTwoLists` C++ signature is byte-identical to the one already in
the repository.

### Three deliberate refusals

- **Never runs at request time.** The endpoint is unofficial, has no contract
  and can change without notice. It writes files; that is all. A student running
  code must never depend on it being up.
- **Never produces expected outputs.** LeetCode exposes sample *inputs* only —
  the answer key stays behind their judge. Outputs are computed by running a
  reference solution, which is the rule that stops a wrong answer key being
  committed.
- **Never ships the statement verbatim.** It is LeetCode's copyright and this
  repository is public. The raw HTML lands in the draft under
  `_leetcodeStatementHtml` purely as reference for rewording.

### It refuses rather than guesses

Unsupported types abort that question. `character` is the common one: the
harness has no char type, and importing it as `string` would produce a program
that compiles and returns wrong answers — far worse than a skip. Class-based
design problems (LRU Cache, Min Stack, Trie) are skipped too; the harness runs a
single function and a class-based one does not exist yet.

Tested against five problems: `two-sum`, `longest-substring-without-repeating-characters`,
`merge-two-sorted-lists` and `valid-palindrome` imported correctly with the
right signatures, patterns and sample cases; `lru-cache` was correctly refused
for the unsupported type `list<String>`.

Drafts land in `data/questions/drafts/`, which is gitignored because reference
solutions are the answer key.

## What I verified

- Both migrations applied; category counts confirmed by querying the database
- The group-discussion row survived in `other`, as designed
- Importer run against five problems covering arrays, strings, pointer types and
  a design problem
- Generated signatures compared against existing hand-written ones and match
- Backend typechecks; frontend builds and lints clean
- Generated Prisma client contains both `aptitude` and `patterns`

## What I have **not** verified

- **The app has not been opened since the migration.** Aptitude rounds now pick
  from a category that did not exist an hour ago; nothing has confirmed the
  rounds still populate in the browser.
- **`prisma generate` did not fully complete** — it hit `EPERM` renaming
  `query_engine-windows.dll.node` because the dev server holds it. The
  TypeScript types were written (both new fields are present and typecheck
  passes), but the engine binary was not replaced. Same Prisma version, so it
  should be inert; restarting the backend removes the doubt.
- **No question has been ingested with a `patterns` value yet.** The write path
  is typechecked, not exercised.
- **Nothing consumes `patterns` yet.** The column exists and ingestion fills it;
  no endpoint or UI surfaces "more like this" so far.
- **The four test drafts are still in `data/questions/drafts/`** — untouched,
  gitignored, and usable as a starting point.

## Still to do in this phase

1. Author questions to take each core pool from 15 to roughly 40
2. Add companies from the user's placement-cell material, batch by batch
3. Company logos as each is added — one line in `components/companyLogos.ts`
4. Surface "more like this" using `patterns` once tagged questions exist

---

## In plain English

Two foundations went in before any question gets written, because both would
have been painful to retrofit.

The first is that aptitude is now its own subject. It used to be filed under
"other" alongside genuine miscellany, which made the smallest pile of questions
in the project look bigger than it was. Moving it needed a database migration,
and that turned up something worth knowing: the database held ten questions in
"other" while the files only accounted for eight, and one of the ten was a group
discussion question that would have been silently relabelled as aptitude by the
obvious one-line fix. It is now excluded by name, and two orphan questions that
exist only in the database are documented rather than mysterious.

The second is a script that drafts coding questions from LeetCode. Adding one by
hand means writing nine things; six of them — the function name, the parameter
types, the return type, starter code for four languages, the difficulty and the
algorithmic pattern — are mechanical, and LeetCode's public endpoint already
knows all six. The script fetches those so the real work goes into the parts
that need thought: the hidden test cases and a reference solution. It refuses
problems it cannot represent correctly rather than importing something broken,
which matters more than the convenience does.

It also solves the "similar questions" problem without any machine learning.
LeetCode labels its own problems by pattern, so a sliding-window question
arrives already tagged as one, and finding more like it is a database filter
rather than a similarity score nobody can audit.
