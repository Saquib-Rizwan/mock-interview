# Phase 11 — closing the loop before deployment

Status: **items 1, 2 and 6 done. Items 3-5 are checks that need a browser and,
for one of them, the Judge0 VM.**

Deployment was going to be the next phase. It was deferred one step because a
public URL makes every rough edge visible at once, and this project had five
that had never been looked at — two of them created by Phase 10 itself.

The rule for the whole phase: **nothing that currently works may stop working.**

## What this covers

| # | Item | Kind | State |
|---|---|---|---|
| 1 | Progress counts mock tests | code | **done** |
| 2 | Past attempts are reachable | code | **done** |
| 3 | Mobile at 375px | check | outstanding since Phase 8 |
| 4 | Monaco editor theme | check | **never rendered at all** |
| 5 | `--muted` contrast | check | outstanding since Phase 8 |
| 6 | Round briefings stopped being a wall of prose | code | **done** |

Then Phase 12 is deployment, with two security items as pre-flight: rotating the
Gemini key pasted in chat during Phase 4, and a deliberate decision about answer
keys in a public repository — hidden test cases, and now `correctIndex` and
`solution` for 61 MCQs.

## 1. Progress counts mock tests

Phase 10 added a whole answering mode and never told the progress page. A
student could sit three timed papers and see nothing change, which quietly said
the mock tests did not count.

`/progress` now also loads submitted attempts and reports:

- **`assessments`** — one row per paper with attempts taken, best score and best
  percentage, newest activity first
- **`totals.assessmentAttempts`**
- mock tests in **recent activity**, alongside written and coding

### Best, not latest

The row keeps the *best* score rather than the most recent. The question a
student is asking of this page is "how well can I do this paper", not "how did
the last one go" — and a bad attempt on a paper already passed should not erase
that.

### Abandoned attempts are excluded

`where: { submittedAt: { not: null } }`. An attempt that was started and walked
away from has null scoring columns; counting it would drag every average towards
zero for tests nobody ever finished. That is exactly why `submittedAt` and the
scoring columns were made nullable *as a group* back in 10a — the distinction
was designed in before there was anything to distinguish.

### One type change did the work

`RecentActivity.questionId` became **`href`**, decided server-side. A mock test
has no single question, so the row could no longer build its own URL from one.
Widening the type turned that into a compile error in exactly the one place that
needed changing — `Progress.tsx` line 212 — rather than a broken link found by a
user.

`category` became nullable for the same reason: a paper spans several, so it
reports none and the "mock test" label identifies it instead.

### Negative marking versus a progress bar

A score can be **below zero** when negative marking bites, and a bar cannot draw
that. The fill is clamped at zero and the real signed figure is printed beside
it, so the row stays readable without lying about the number.

## 2. Past attempts are reachable

Before this, a result was visible exactly once. You submitted, saw the score,
navigated away, and it was gone — even though the attempt row and its score had
been stored the whole time and `GET /attempts/:id` already existed. *"Did I
improve?"* was unanswerable, which made retaking a paper far less useful than it
should have been.

Three additions:

- **`GET /assessments/:id/attempts`** — this user's finished sittings, newest
  first, submitted only
- **`/attempts/:id`** — a page showing any past attempt in full, score and
  per-question review
- **The start screen lists your history** before you retake, so a repeat has a
  number to beat. The button reads *"Take it again"* once there is one.

### The review markup moved rather than being copied

`components/AttemptReviewView.tsx` is now shared by the runner and the standalone
page. Copying it would have left two renderings of the same answer key to drift
apart, which is the worst thing to duplicate in this application.

### No new guard was needed, and that is the point

The standalone page adds no access check of its own. The review endpoint already
returns **409** for an unsubmitted attempt and **404** for one belonging to
somebody else, so an unfinished or borrowed id simply shows the error. The guard
lives where the data does, and a second copy at the page level would have been a
second thing to keep correct.

Listing history fails quietly: if the request errors the start screen still
offers a new attempt, because not being able to show the past is no reason to
block the present.

## 6. Facts before prose

The round notes carry every process detail a source document gave — format,
duration, outcome, tips, warnings. That is deliberate and it is why the
catalogue is worth anything. But rendering all of it as one paragraph made the
role page a wall of text and buried the questions on the round page.

Two changes, neither of which throws anything away:

**On the spine, the note is clamped to two lines.** A hiring process *is* a
sequence and that page exists to show it; a paragraph per row destroyed the
sense of one. The full note is a click away on the round itself.

**On the round page, facts come before prose.** A strip of label-over-value
pairs — format, question count, and for an assessment its time limit and wrong-
answer penalty — then the briefing clamped to three lines behind *"Read the full
briefing"*.

Nothing in that strip is parsed out of the note text. Every value is a field the
database actually holds, so it cannot be wrong about a round whose note happens
to be worded unusually. Parsing prose for a duration would have looked identical
and been wrong eventually.

The briefing is a fifth list device — an accent rule down the left, marking it
as an aside rather than body copy. Progressive disclosure rather than a modal or
a scrollbox: it is reference material you consult once, not something to hide
for the sake of tidiness.

## Three more companies

**Electrifex** (5 rounds), **Electrobit** (2 rounds), and **Deloitte's real
process** — which is the interesting one. Deloitte already existed in the
catalogue with two roles invented before any source material arrived. Rather
than rewrite those, the documented *Analyst* role was added alongside them, with
its real eligibility and its real two-round process. The unsourced roles stay
visibly unsourced, which is what the three-state eligibility design was for.

Catalogue: **18 companies, 22 roles, 74 rounds, 5 assessments, 65 MCQs.**

### The schema gap, found and deliberately not filled

**Deloitte Round 1 applies sectional cut-offs** — each section must be cleared
on its own, so a strong total does not rescue a weak section. TCS's notes
mention the same thing. Two companies, which is the threshold this project uses.

`AssessmentSection` has no cut-off field, and **it is still not getting one**,
because *neither source states the value*. A `cutoffMarks Float?` could only
ever hold null here, and a cut-off that cannot be enforced is a column that
lies by implication. It is recorded in the round notes instead, where a student
reads it, and the mock says plainly that it does not enforce one.

That changes the moment a document gives a number.

### Derived durations, again

Deloitte states 67 questions in ~60 minutes and Electrifex 30 in 30. Both mocks
are shorter, so both inherit the **pace** rather than the clock — about 54 and
60 seconds per question respectively — and both round notes show the arithmetic.
Abilytics still keeps its documented 45 minutes because its question count was
never given and there is no ratio to derive.

### Logos: one traced, two rejected on the render

**Deloitte traced as the letterform, not the field.** Its mark is a black square
with a white "D." knocked out; tracing the black produced a cream tile with an
ink D, which is the mark inverted. Since `.cmark` is already an ink block,
taking the *light* pixels inside the square instead puts a cream "D." on dark —
which is how the original actually reads. It is the crispest logo in the set
after Microsoft.

**Electrifex is a wordmark** and **Electrobit's orbital swirl is thin arcs that
fragment into disconnected specks below about 40px.** Both were traced and
rejected on the rendered result rather than on assumption. The rule from Phase 9
now holds at six for six: solid marks survive, thin and lettered ones do not.

## Nothing was broken

- Written and coding submissions are untouched; `/progress` gained fields and
  changed one, and the changed one was caught by the compiler.
- The runner behaves identically — the review it shows is the same markup, now
  imported.
- No schema change and **no migration**: every field used here already existed.
  Phase 10 stored the score, the counts and the answers on submit; this phase
  only started reading them.

## What I have **not** verified

- **Nothing has been run.** Both typechecks pass. No attempt has been listed, no
  past review reopened, no progress page rendered with a mock test on it.
- **Items 3, 4 and 5 are untouched** — they are browser checks, and the Monaco
  theme needs a coding question, which needs `az vm start` on the Judge0 VM.
- The **negative-score progress bar** has never been seen with a genuinely
  negative score.
