# Phase 5 — General Question Bank Ingestion

Status: ready for review.

## Schema change (flagged and approved before implementing)

Phase 1's `QuestionCategory` enum had no value for OOPS. The source material provided in this phase covered OS, CN, DBMS **and OOPS**, so the fourth subject fitted no existing category.

Per the project's rule about flagging rather than silently altering earlier schema, this was raised before any code was written. Approved decision: **add `oops` to the enum** rather than filing it under `other`, which would have made those questions unfilterable. Migration `20260803090557_add_oops_category`.

Adding a value to a Postgres enum does not rewrite existing rows, so this was a cheap change. It did require a matching frontend fix — see limitations.

## What was implemented

**Data** — `data/questions/` with one file per subject: `os.json`, `cn.json`, `dbms.json`, `oops.json`. 15 questions each, 60 total.

**`backend/scripts/ingest-questions.ts`** — loads a JSON file into the `Question` table.
```
npm run ingest --workspace backend -- ../data/questions/os.json
```

**`backend/scripts/attach-questions.ts`** — wires existing questions into a round via `RoundQuestion`.
```
npm run attach --workspace backend -- --list
npm run attach --workspace backend -- --round <id> --category os --count 5
npm run attach --workspace backend -- --round <id> --ids <id1>,<id2>
```

**`backend/package.json`** — added `ingest`, `attach` and `typecheck` scripts.

**`backend/tsconfig.json` / `tsconfig.build.json`** — split so the new `scripts/` directory is typechecked (see below).

**`frontend/src/api.ts`, `components/labels.ts`** — added `oops` to the category union and its display label.

No new dependencies.

## Why this approach

**JSON, not CSV** (your call). The deciding factor is `expectedAnswerPoints`: it is an array, and CSV would need a separator convention inside a single cell, which then breaks the moment an answer point contains that separator. Question text also routinely contains commas, quotes and colons. JSON handles all of it natively and gets syntax checking in the editor as you type.

**Validate everything before inserting anything.** The script checks every record first and aborts on the first file containing errors, rather than inserting valid records as it goes. A half-loaded file is worse than a rejected one: you cannot tell what made it in without diffing, and re-running would then double-insert the successful half. Errors are reported with their array index and all problems at once, so one run tells you everything to fix.

**Rejecting questions with no expected answer points.** Phase 4 grades strictly against those points and returns 409 for a question that has none. Catching it at load time rather than when a student submits is the whole value of validating.

**Duplicate detection in the script, not as a database constraint.** `Question` has no natural unique key — the same wording can legitimately exist under two categories, and a `@unique` on `text` would block that permanently. Checking for existing text inside the script keeps re-running safe without foreclosing deliberate near-duplicates. The trade-off is that two ingests running simultaneously could both insert the same question; not a concern for an admin script run by hand.

**`--count` means "add N more", not "make it N".** Re-running `--category os --count 4` attaches four *different* OS questions, because already-attached ones are excluded from the candidate query. This is the useful behaviour for topping a round up, but it is not a no-op, so re-running it repeatedly will keep adding questions until the bank runs out. Attaching by explicit `--ids` *does* skip anything already present and reports it.

**tsconfig split.** `scripts/` sits outside `src/`, so the old single tsconfig neither typechecked it nor gave the editor language support — which would have reproduced exactly the red-mark annoyance from the Phase 4 cleanup. `tsconfig.json` now covers `src`, `scripts`, `prisma` and `prisma.config.ts` with `noEmit`, and `tsconfig.build.json` extends it with `rootDir: src` for the actual build. `npm run build` is unchanged in behaviour; `npm run typecheck` is new.

**Questions were written, not copied.** The source PDFs are Apna College material (two of the four are watermarked with a third party's email address). Beyond the licensing question, the notes are prose — Phase 4 needs discrete, individually checkable points, which prose does not convert into cleanly. The questions here cover the same syllabus with expected-answer points written for the grader.

## How it works

```
data/questions/*.json
      │  npm run ingest
      ▼
  validate every record  ──► any error: abort, insert nothing
      │
      ▼
  skip texts already in DB, and duplicates within the file
      │
      ▼
  Question table  (category set, no round attached)
      │  npm run attach --round <id> --category os --count 5
      ▼
  RoundQuestion  ──► question now appears in that round's page
```

Ingested questions are deliberately unattached to any round. Filing them under a category makes them available to the bank; attaching is a separate, explicit step, so loading 200 questions does not change what any student currently sees.

### File format

```json
[
  {
    "text": "What is thrashing? What causes it and how can it be resolved?",
    "category": "os",
    "difficulty": "medium",
    "questionType": "text",
    "expectedAnswerPoints": [
      "Thrashing is when the system spends more time swapping pages than executing useful work",
      "Caused by too many processes competing for too little physical memory"
    ]
  }
]
```

| Field | Rule |
|---|---|
| `text` | non-empty string |
| `category` | `company_specific`, `os`, `cn`, `dbms`, `dsa`, `oops`, `general_hr`, `other` |
| `difficulty` | `easy`, `medium`, `hard` |
| `questionType` | `text` or `coding` |
| `expectedAnswerPoints` | non-empty array of non-empty strings |

## Known limitations / things deferred

- **The category list is duplicated between backend and frontend.** `QuestionCategory` exists as a Prisma enum *and* as a hand-written TypeScript union in `frontend/src/api.ts`. Adding `oops` to the schema silently broke the frontend badge until both were updated — the label lookup returned `undefined` and rendered blank. A comment now flags this in both files, but the real fix is generating the frontend types from the schema, which is deferred. **This is the sharpest rough edge in the project so far.**
- **No admin UI.** Ingesting and attaching are command-line only, as the brief allowed. There is no way to add or attach questions from the browser.
- **No update or delete path.** Editing an ingested question means changing it in the database directly; re-running ingest will skip it as an existing text. There is no `--update` mode.
- **Duplicate detection is exact-text only.** Two questions differing by a single character or by punctuation are treated as distinct. No fuzzy matching.
- **`--count` keeps adding on repeat runs**, as described above. Check with `--list` before re-running if you are unsure what a round already holds.
- **No transaction wrapping the insert.** `createMany` is a single statement so a partial insert is unlikely, but the validate-then-insert sequence is not atomic against another process writing concurrently.
- **Question quality is not verified against a syllabus.** The 60 questions cover the topics in the supplied PDFs, but nobody has checked them against your actual course or a specific company's pattern. Treat the expected-answer points as a first draft to review, not as authoritative marking schemes.
- **Coding questions are still unsupported by the pipeline in any special way.** `questionType: "coding"` is accepted and stored, but there is no way to attach test cases — Phase 6.
- **No automated tests.** Verified by hand as below.

## How to verify it works

Prerequisite: the database container running (`docker compose up -d`). Commands run from `d:\mock-interview\backend`.

### 1. Load the question files

```
npm run ingest -- ../data/questions/os.json
```

Expect:
```
Ingested ../data/questions/os.json
  inserted:            15
  skipped (in DB):     0
  skipped (dup in file): 0
  total in file:       15
```

Repeat for `cn.json`, `dbms.json` and `oops.json`.

**Now run the same command a second time.** Expect `inserted: 0` and `skipped (in DB): 15`. That is the duplicate guard — re-running is safe and will not double up your bank.

### 2. Confirm a bad file is rejected cleanly

This is the behaviour worth trusting, so it is worth seeing. Create a file with one good record and one broken one, and try to ingest it — the script names every problem with its index and inserts **nothing**, including the valid record:

```
4 validation error(s) in bad.json:
  [1] text is required and must be a non-empty string
  [1] category must be one of: company_specific, os, cn, dbms, dsa, oops, general_hr, other
  [1] difficulty must be one of: easy, medium, hard
  [1] expectedAnswerPoints must be a non-empty array

Nothing was inserted.
```

### 3. Attach questions to a round

```
npm run attach -- --list
```
Lists every round with its id and current question count. Copy the id of `TCS / Systems Engineer / 2. Technical Interview`.

```
npm run attach -- --round <that-id> --category os --count 4
```
Prints the round it targeted and the four questions it attached.

### 4. See them in the browser

Start the servers (ml-service, backend, frontend), log in, and navigate **TCS → Systems Engineer → Technical Interview**. The newly attached OS questions appear in the list with their category and difficulty badges, mixed in with the seeded ones.

Then open **Deloitte → Business Analyst → HR Interview**. It contains the Deloitte `Company specific` question alongside `General HR`, `Networks` and three `DBMS` questions — one of which (*"What are the isolation levels in SQL…"*) came from this phase's ingestion. **That combination is this phase's acceptance criterion**: a question you handed over in the agreed format, appearing inside a round beside a company-specific one.

### 5. Confirm ingested questions are actually gradable

Click one of the newly attached OS questions, type a partial answer and submit. The Phase 4 grader should return per-point verdicts that reference the expected points from the JSON file. This proves the answer points survived ingestion in a usable shape, not just as text.

Or check directly:
```
docker exec -i mock-interview-db-1 psql -U mockinterview -d mockinterview -c "SELECT count(*) FROM question WHERE array_length(expected_answer_points,1) IS NULL;"
```
Expect `0` — no question in the bank is ungradable.

## What I verified myself

Ingested all four files: 15 inserted from each, 60 total, database now holds 73 questions and 0 with empty answer points. Re-ran `os.json` and got `inserted: 0, skipped: 15`. Fed the script a file containing one valid and one invalid record — it reported all four validation problems by index and inserted neither record (confirmed the valid one was absent from the database afterwards). Attached 4 OS and 3 OOPS questions to the TCS technical round and 2 DBMS questions to the Deloitte HR round; re-attaching an already-attached question by explicit id reported `attached: 0, skipped (already attached): 1`. Confirmed via the catalog API that the Deloitte HR round returns the company-specific question alongside the newly ingested DBMS one, **and that `expectedAnswerPoints` is still absent from the API response**. Backend typechecks (now including `scripts/`), frontend lints and builds clean.

**Not verified by me:** the rendered browser pages, and end-to-end grading of a newly ingested question through the live LLM. ml-service was not running during my checks. Steps 4 and 5 above need your eyes — step 5 in particular, since it is the only thing that proves ingested answer points work with the Phase 4 grader rather than merely being stored.

---

## In plain English

This phase turns a pile of subject notes into a usable question bank. You hand over a JSON file of questions, run one command, and they land in the database ready to be used in any company's interview rounds. Sixty questions went in — fifteen each for OS, Networks, DBMS and OOPS.

The interesting design decision is that **loading and using are deliberately separate steps**. Ingesting a question files it under a subject but attaches it to nothing, so dropping 200 new questions into the bank changes nothing a student currently sees. A second command then picks questions out of that bank and attaches them to a specific round. That separation is what makes the general bank genuinely general — the same OS question can be pulled into TCS's technical round, Deloitte's, and anyone else's, and it exists as exactly one row in the database.

The other thing worth understanding is why the loader is fussy. It validates every record in a file *before* writing a single one, so a typo in question 40 means nothing gets inserted rather than the first 39 landing and leaving you to work out where it stopped. It also refuses any question with no expected answer points — because Phase 4 grades strictly against those points, a question without them can be browsed but never answered, and it is much better to catch that when loading than when a student hits submit. Re-running the same file is safe: anything already in the database is skipped rather than duplicated.

One thing this phase exposed is worth flagging honestly. Your OOPS notes needed a category the Phase 1 schema didn't have, so we added one — a small migration. But the list of categories is written down in *two* places: once in the database schema and once by hand in the frontend's TypeScript. Adding `oops` to the schema quietly broke the frontend badge, which rendered blank until both were updated. It's fixed and commented, but the real solution is generating the frontend types from the schema so they can't drift apart. That's the sharpest rough edge in the codebase right now, and it'll bite again the next time an enum changes.
