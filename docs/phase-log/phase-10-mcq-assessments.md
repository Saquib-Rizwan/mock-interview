# Phase 10 — MCQ assessment rounds

Status: **10a, 10b and 10c complete — the loop closes.** Schema and loader,
then taking the test timed and scored, then the review with worked solutions.
What remains is 10d: enough questions for the per-company filtering to mean
something.

The format most companies actually screen with, and the one the catalogue could
not express. Until now an MCQ round was encoded as written questions with an
apology in its `notes`: *"the real round is multiple choice under negative
marking; practising these builds the knowledge but not the speed or the
guess-discipline."* Honest, but it was a placeholder.

## Why it was deferred, and what unblocked it

Recorded in `phase-9-catalogue-expansion.md`: the phase was parked because the
*structure* of an assessment varies between companies, not merely its values, so
a flat model would not survive real data. Two drives supplied it:

| | Abilytics | Anora Labs |
|---|---|---|
| Shape | one undivided paper | **three consecutive sections** |
| Duration | 45 min overall | 75 / 30 / 15 min per section |
| Questions | not stated | 65 / 5 / 15 |
| Marking | **negative marking** | single mark each |

Those two disagree about whether sections exist at all, and about whether wrong
answers cost anything. **That disagreement is the design.** Sections are a table
rather than columns because one company has three and the other has none;
negative marking sits per-assessment because a global constant would have been
wrong for one of them on the first day.

## The design decision that changed

The Phase 9 note proposed `roundMode: interview | assessment` as its own field,
on the grounds that `roundType` alone cannot decide format — there are a dozen
`technical` rounds and some are tests while others are conversations.

**Dropped.** A round is an assessment round exactly when an `Assessment` row
points at it. The existence of the row *is* the mode. A separate flag would be a
second source of truth that could disagree with whether an assessment actually
exists, and there is no state where the two should differ.

## Schema

Five additions, one migration.

| Model | Holds |
|---|---|
| `McqSpec` | `options`, `correctIndex`, `solution` — one row per MCQ question |
| `Assessment` | 1:1 with `Round`; total duration, negative marking, revisit rule |
| `AssessmentSection` | order, name, per-section duration, marks per question |
| `AssessmentQuestion` | which questions sit in which section, in order |
| `AssessmentAttempt` | one sitting: answers, timing, score |

### The answer key is in its own table, on purpose

`McqSpec` mirrors `CodingSpec` rather than adding columns to `Question`, and the
reason is the same one that put hidden test cases in their own rows:
**`correctIndex` is absent from every query that does not name the table.** A
leak requires someone to actively join, not merely to forget an exclusion. For a
mock test whose entire value is not knowing the answer in advance, defence by
omission beats defence by remembering.

`/catalog/questions/:id` selects `mcqSpec: { select: { options: true } }` —
options and nothing else. `correctIndex` and `solution` are never fetched while
a test is in progress.

### One migration, despite the enum

`20260825183000_add_mcq_assessments` adds `mcq` to `QuestionType` *and* creates
five tables in a single migration, unlike the two-part split in Phase 9.

The Postgres restriction is on **using** a newly added enum value in the
transaction that adds it, not on adding it. Nothing here writes `'mcq'` to a
row — the tables are created empty and questions are labelled by a later ingest
run — so the two can share a migration. Postgres 16, so `ALTER TYPE ... ADD
VALUE` inside a transaction is permitted at all.

### Nullable together, deliberately

`AssessmentAttempt.submittedAt` and every scoring column are nullable as a
group. An attempt that was started and abandoned therefore stays
distinguishable from one that was submitted and genuinely scored zero — which
matters precisely because negative marking makes zero a real score rather than
an obviously-missing one.

`answers` is a JSON map of `questionId -> selectedIndex`. A question absent from
the map was **not answered**, which under negative marking is scored differently
from answering it wrongly. That distinction is the whole reason the drives warn
*"attempt only when confident"*.

## Loading

`npm run ingest:mcq --workspace backend -- <file>`, alongside the existing
`ingest` and `ingest:coding`. Separate for the same reason `ingest-coding.ts` is
separate: an MCQ needs options, a correct index and a worked solution, and
folding those into the general loader would fill it with *"required unless
questionType is mcq"* branches.

It validates everything before writing anything, and rejects:

- fewer than two options, or any two options identical — two identical choices
  make a question unanswerable rather than untidy, since whichever is picked the
  grader cannot say it was wrong
- `correctIndex` out of range for the options actually supplied — **the single
  most damaging defect an MCQ file can carry is a wrong answer key**
- a missing `solution`, because grading after the whole test is only useful if
  the review can explain why
- any `expectedAnswerPoints`, which would mean the author expected LLM grading

`ingest-questions.ts` now routes `mcq` records here with a pointed message
rather than failing them under the *"must have expectedAnswerPoints"* rule,
which produced a misleading error.

## Nothing existing was disturbed

The brief was to add this without breaking what works. Checked rather than
assumed:

- **`submissions` already refuses anything that is not `text`**, and **`coding`
  refuses anything that is not `coding`**. An `mcq` row cannot be answered down
  either route by accident; both guards predate this phase.
- MCQ questions are attached through `AssessmentQuestion`, **not**
  `RoundQuestion`, so they never appear in an ordinary round listing.
- `QuestionDetail` gained an explicit `mcq` branch. Without it the page would
  have rendered the written-answer form and submitting would have been rejected
  by the guard above — a dead end reached only after the student had typed. It
  now shows the options read-only and says the question is answered inside its
  timed assessment.
- Existing companies, rounds, pools and eligibility are untouched. No round
  gains an assessment in 10a.

## First questions

`data/questions/mcq-batch-1.json` — 15, across `dsa` 3, `oops` 3, `os` 3,
`dbms` 2, `cn` 2, `aptitude` 2. Three are the sample MCQs the drives actually
documented: the browser back-button data structure and the *"NOT a feature of
OOP"* question from Abilytics, and the two-pipes problem from its archive.

Every numeric answer was recomputed independently rather than re-read — the
two-pipes rate as an exact `Fraction`, the `/29` host count as `2**(32-29)-2`,
and the percentage question both ways. Structural rules were checked against the
loader's own conditions before the file was offered to it.

### MCQ-versus-text overlap is expected

The duplicate scan flagged four pairs, the strongest at 0.64: the two-pipes MCQ
against the existing *"pipe A fills, pipe B empties"* written question. **Not
duplication.** They are different problems — one adds rates, the other subtracts
— and more generally an MCQ tests recognition while the written form tests
explanation. They also cannot co-occur: MCQs live in `AssessmentQuestion` and
written questions in `RoundQuestion`.

## 10b — taking the test

`backend/src/assessments/routes.ts` and `pages/AssessmentRunner.tsx`.

### Two routers, because the two things have different lifetimes

`/assessments` is catalogue data everyone shares. `/attempts` belongs to one
user and is mutable until submitted. Every attempt route loads through
`ownedAttempt()`, which returns the same 404 whether the attempt does not exist
or belongs to somebody else — the distinction is only useful to someone probing
for other people's sittings.

### The rule that governs the whole file

**`correctIndex` and `solution` are never selected while an attempt is open.**
They are read in exactly one place, the submit handler, and even there they are
used to compute a score and then discarded rather than returned. The runner's
`AssessmentQuestion` type has no field for either, so a careless render cannot
reveal one — the type system is doing part of the work.

### Scoring is server-side and computed from McqSpec

Not from anything the client sends. `score = correct x marksPerQuestion -
wrong x negativeMarking`, unanswered scores zero.

Rounded to two decimals, which is not cosmetic: 0.25 deductions accumulate
binary-float noise, and a student seeing `-0.7999999999` would reasonably read
it as a bug. Verified against six scenarios before anything was run, including
all-correct, all-wrong and the mixed cases either side of zero.

### Decisions the format forced

- **The clock runs off the server's `startedAt`**, not a local countdown, so
  reloading the page cannot buy more time.
- **An open attempt resumes rather than starting a second one.** Without that, a
  refresh mid-test would abandon the sitting and silently restart the clock —
  lost work and a way to reset the timer.
- **Clicking a chosen option again clears it.** Under negative marking an
  unanswered question costs nothing while a wrong one costs marks, so
  withdrawing a guess is a real part of taking the test, not a UI nicety.
- **Answers are sent again with the submit**, so a selection made after the last
  autosave cannot fall into the gap between the two requests.
- **Time expiry auto-submits.** A test that simply stops being answerable would
  lose the work.

### The one assumption, stated in the product

Abilytics' source says negative marking applied but never says how much. The
catalogue uses **0.25**, the usual convention, and the round `notes` say so in
as many words: the 45-minute limit and the fact that marks are deducted are from
the source; the 0.25 is not. Same principle as `ASSUMED_MIN_CGPA` — the
assumption is visible to the student rather than buried.

### Additive, so nothing was taken away

A round with an assessment **keeps its written practice questions and gains a
mock test**. Replacing one with the other would have removed working
functionality from a round that already had it. `seed-catalog` upserts the
assessment alongside the existing `RoundQuestion` diff and touches neither.

Section questions are rewritten wholesale rather than diffed, because order
matters here in a way it does not for a round listing and a stale `order_index`
would collide with the unique index.

### What is attached

Only **Abilytics Round 1**: one section, 12 questions, 45 minutes, 0.25
negative. One assessment because there are only 15 MCQs so far.

**Multi-section is built but unexercised.** Anora's paper is the sectioned one —
75/30/15 minutes across 65/5/15 questions — and its pools are nowhere near deep
enough yet. It gets attached in 10d. Abilytics is deliberately single-section
because its source describes one undivided paper; giving it two to exercise the
code would have been inventing structure.

## 10c — the review

`GET /attempts/:id/review`, rendered in the same page as the result.

### One route, one guard

**This is the only route in the application that ever sends `correctIndex` or
`solution`, and it refuses with a 409 unless the attempt has a `submittedAt`.**

That single check is what stops the review being used as an oracle. Without it a
student could open a second tab on an in-progress attempt and read the entire
key while the clock was still running — which would not be a bug in the review
so much as the quiet end of the mock test being a test at all.

The client types enforce the same shape from the other side: `AssessmentQuestion`,
used while taking the test, simply has no field for either value, so a careless
render cannot leak one. `ReviewQuestion` is a separate type and only the review
endpoint fills it.

### Marks are signed, per question

`+1`, `-0.25` or `0`, so the review shows exactly where the score went rather
than only what it ended at. An unanswered question shows `0` rather than a
deduction, which is the whole guess-discipline lesson these papers teach made
visible one question at a time.

### A fourth list device

Per the Phase 8 rule that uniform rows read as generated, this list marks itself
differently from the three that already exist — the round listing's margin rule,
the spine's filled node, the test's numbered pips. Here **the verdict is the
device**: a thick left rule coloured ink for correct, accent for wrong, faint for
skipped, so the page can be skimmed for mistakes without reading a word.

Within a question the correct option is a solid ink block and a wrong pick is
outlined in accent — two different devices deliberately, because when a student
picks wrongly both land on adjacent rows and one treatment would have made them
hard to tell apart.

## Per-company filtering: the mechanism exists, the depth does not

Worth stating plainly because it looks like a missing feature and is not.

Each section already declares its own `picks` by category, so an assessment is
defined by that company's own topics — Abilytics draws across aptitude, DSA,
OOPS, OS, DBMS and CN because that is what its source lists. Writing a different
mix for Anora or Cloudium is a data change, not a code change.

**What is missing is questions.** With 15 MCQs in the bank, every company's paper
would draw nearly the same set however the picks are written. Depth is what makes
the filtering visible, which is 10d.

Two categories the drives ask for and the catalogue cannot currently express:

| Topic | Asked by | Status |
|---|---|---|
| C programming — pointers, output prediction | Anora, Abilytics | **no category** |
| Python basics | Armada, Cloudium, Abilytics | **no category** |
| Cloud — IaaS/PaaS/SaaS | Cloudium, Abilytics | **no category** |
| DevOps / CI-CD | Abilytics | **no category**, one company only |

**Decided and done** — `20260825201500_add_language_and_cloud_categories` adds
`c_programming`, `python` and `cloud`. **DevOps was rejected**: Abilytics alone
asks for it, so it stays an inline company-specific question until a second
drive does.

One migration and no data step, unlike the aptitude split at `20260812130633`.
That one had to be split because it *reassigned* existing rows to a newly added
value, which Postgres forbids in the transaction that adds it. Nothing is
reassigned here — no existing question belongs in any of these — so the three
values are simply added and left unused until the next ingest run.

Added **before** authoring rather than after, which is the entire point. Writing
150 questions into `other` and migrating them afterwards is the same mistake
this project already made once with aptitude, and it cost two migrations plus a
hand-written exclusion for the one row that did not belong.

`CATEGORY_LABELS` is typed `Record<QuestionCategory, string>`, so widening the
union made the missing labels a compile error rather than a silent `undefined`
in the UI — which is exactly how the Phase 9 version of this bug escaped.

### The leak defence, verified statically

Checked across the whole backend rather than by looking at one response:

- **`solution`** is selected in exactly one place, the review handler, behind
  the 409.
- **`correctIndex`** in exactly two: the review handler, and the submit handler,
  where it is read to compute a score and never placed in a response.
- Every other route selects `mcqSpec: { select: { options: true } }`.

A static sweep is the stronger check here — a browser test only covers the
response you thought to open.

## What I have **not** verified

- **Nothing has been run.** Migration written, not applied. No MCQ ingested, no
  assessment seeded, no attempt taken. Both typechecks pass and the schema
  validates.
- **Scoring is verified by arithmetic, not by a sitting.** The formula was
  checked against six scenarios; it has never scored a real attempt.
- **The leak defence is reasoned, not observed.** `correctIndex` is not selected
  anywhere outside the submit handler, but nobody has opened DevTools mid-test
  to confirm it.
- **The auto-submit on expiry has never fired.**
- **The review has never been rendered**, and the 409 that gates it has never
  been triggered. That guard is the single most important claim in the phase and
  it is currently reasoned rather than observed.
- **Multi-section rendering has never been seen** — see above.

## Superseded — 10a's unverified list

- **Nothing has been run.** The migration is written but not applied, and no MCQ
  has been ingested. Both typechecks pass and the schema validates.
- **The Prisma client regenerated with an `EPERM`** on the query-engine DLL
  because the dev server holds it — the same failure recorded in Phase 9. All
  model types were written and both typechecks pass; only the binary was not
  replaced. Stopping the dev server before migrating removes the doubt.
- **No assessment exists yet.** No round has one attached, so there is nothing
  to take. That is 10b.
- **The leak defence is reasoned, not observed.** `correctIndex` is not selected
  anywhere, but no one has yet opened DevTools on a live MCQ to confirm it.

## Still to do

- **10b** — take the test: timer, navigation, changeable answers, submit,
  scoring with negative marking. Needs the attempt endpoints and a new page.
- **10c** — review: per-question verdict plus the worked solution, revealed only
  after submission.
- **10d** — bulk authoring, roughly 150 MCQs from the four subject PDFs, which
  already carry their own answer keys.

Then assessments get attached to Abilytics, Anora and Cloudium, and the
format-gap apologies come out of those round notes.

## Out of scope, and recorded as out

| Not built | Why |
|---|---|
| Psychometric sections (Anora S3, Cloudium R2) | No right answers. A different grading model entirely, and Cloudium's is explicitly not an elimination round |
| Text-editor coding sections (Anora S2) | No compiler; judged on logic, not on test cases. Not the Judge0 flow |
| Per-section cut-offs | **No company has stated one.** Building it would mean inventing the numbers |
| Branch-specific papers | Only Anora, and only for EC and ME |
