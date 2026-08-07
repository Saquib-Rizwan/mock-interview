# Phase 7 — Progress & History

Status: **built; aggregation verified against seeded data. Browser page not yet confirmed by eye.**

Scope deliberately limited to the progress/history view. The brief's other Phase 7 candidates — voice-based answering, additional round types, additional colleges' data — are untouched and remain on the shelf.

## Schema change (flagged and approved before implementing)

Phase 4 sent per-point verdicts to the browser and **discarded them**. `Submission` kept only two prose columns, `gap_analysis` and `suggested_answer`, so a text answer could never be scored after the fact. That made every interesting question on this page unanswerable: no per-subject strength, no trend, no sense of what a student repeatedly gets wrong.

Approved decision: add **`Submission.points Json?`** holding the full verdict array, rather than a pair of count columns. Migration `20260807115406_add_submission_points`.

The counts option would have given a percentage and nothing else. Storing the verdicts gives the percentage *and* the recurring-gaps analysis, which is the genuinely useful output — "you have missed the three-way handshake in four of six attempts" is actionable in a way that "you scored 62%" is not.

Nullable, because submissions made before this existed have none. Those render as **attempted but unscored** rather than being assigned invented numbers.

## What was implemented

**Backend**
- `src/progress/routes.ts` — `GET /progress`, scoped to the logged-in user
- `src/submissions/routes.ts` — now persists `analysis.points`
- Wired into `src/index.ts`

**Frontend**
- `pages/Progress.tsx` — the page
- `/progress` route, and a **Progress** link in the top bar
- `api.ts` — `Progress` types and the `api.progress` method
- `App.css` — stat tiles, bars, gaps, and a mobile fallback for the bar grid

No new dependencies.

## Why this approach

**One endpoint, not six.** The page needs totals, subject coverage, language stats, recurring gaps, readiness and recent activity. Six round-trips would each pay the auth middleware's database lookup and arrive at different moments, producing a page that assembles itself in pieces. One request is simpler to reason about and renders at once.

**Aggregated in JavaScript, not SQL.** Every query is scoped to a single user's own submissions, so volumes are small — a heavy user might have a few hundred rows. Half a dozen raw `GROUP BY` statements would be materially harder to read for no measurable gain. If one user ever accumulates enough submissions for this to matter, that is the moment to move it into SQL, and the shape of the response would not change.

**Null coverage is not zero coverage.** A subject with no scored attempts reports `null`, and the page renders "not scored" rather than an empty bar. On a page whose entire job is telling you where you stand, "no data" and "you got nothing right" must not look alike.

**Subjects sorted weakest first.** The ordering is the recommendation. Alphabetical would be arbitrary; strongest-first would bury the thing worth acting on. Unscored subjects sort last, because they are not a weakness — just unknown.

**Text and coding scores are kept apart.** Text answers yield a coverage percentage against expected points; coding yields a test pass rate. They measure different things, so a subject reports whichever applies rather than averaging them into a number that means nothing.

**Readiness is expressed as a fraction of a role's actual question set.** "12 of 23 attempted" is grounded in what that company's rounds contain, which is the only framing that matches what the platform is for. Sorted most-progressed first, so the roles a student is actually working towards rise to the top.

## How it works

```
GET /progress   (auth required, scoped to req.userId)
        │
        ├── Submission[]      + question.category, points
        ├── CodeSubmission[]  + question.category, passed/total
        └── Role[]            + rounds → questionIds     (the catalogue side)
        │
        ▼
   aggregate in JS
        │
        ├── totals          distinct questions, solved counts
        ├── subjects        covered points / total points, per category
        ├── languages       tests passed / tests run, per language
        ├── recurringGaps   points with covered=false, ranked by miss count
        ├── readiness       attempted ∩ role's questions, as a fraction
        └── recent          both tables merged, newest first
```

## Known limitations / things deferred

- **Your existing four text submissions have no `points`.** They predate the column, so they count as attempts but contribute nothing to subject coverage or recurring gaps. New submissions score normally. This is visible rather than hidden — those subjects show "not scored".
- **Recurring gaps match on exact point text.** Two questions whose expected points are worded almost identically are counted as separate gaps. Grouping by meaning would need embeddings, which is well beyond this phase.
- **No time series.** The page shows where you stand, not whether you are improving. A chart of coverage over time is the obvious next addition and is the thing most likely to be asked for.
- **Readiness counts attempts, not success.** Answering a question badly still marks it attempted. A weighted version — attempted, then passed — would be more honest but needs a decision about what "passed" means for a text answer.
- **The whole page is one query set, computed on every load.** No caching. Fine at this scale; would want revisiting if a user had thousands of submissions.
- **Recent activity is capped at 12 and gaps at 8.** Arbitrary numbers chosen so the page stays a summary rather than becoming a log. There is no pagination to see further back.
- **No per-question history view.** You can see that you attempted something and jump to it, but not compare your attempts at the same question side by side. The data supports it; the UI does not.

## How to verify it works

Database up, backend and frontend running. Judge0 is **not** needed unless you want to add coding attempts.

### 1. The empty state

Sign up as a brand-new user and open **Progress** in the top bar. You should get the "nothing to show yet" message and a link back to companies — not a page of zeroes, which would look broken.

### 2. Real data

Log in as yourself, answer two or three text questions in different subjects, then open **Progress**. Check:

- **Subject bars** appear, weakest first, coloured red under 50%, amber under 75%, green above
- Any subject you have not answered in scored form reads **"not scored"**, not 0%
- **What you keep missing** lists expected points you failed to cover, with an `n/m` count
- **Recent attempts** shows your answers newest first, and each links back to its question

### 3. Coding stats

Start the VM (`az vm start -g mock-interview-rg -n judge0-vm`), solve a coding question and run a second one deliberately wrong. The **Coding by language** section should show the language, solved count and test pass rate.

### 4. Confirm scoping

The endpoint is keyed on `req.userId`, so a second account should see its own numbers and none of yours. Sign up as a second user and confirm the page is empty.

## What I verified myself

Backend typechecks; frontend lints and builds.

**Aggregation verified end to end** by creating a throwaway account, seeding it with synthetic submissions covering both scored and unscored paths, and calling the endpoint:

| Section | Seeded | Returned |
|---|---|---|
| Totals | 3 text (3 questions), 2 coding (1 fully passing) | `textQuestions 3, textAttempts 3, codingQuestions 2, codingSolved 1` |
| Subjects | 2 OS submissions covering 2 of 6 points; 1 CN covering 2 of 2 | OS **33%**, CN **100%**, ordered weakest first |
| Languages | python 6/6, cpp 2/6 | python **100%** 1 solved, cpp **33%** 0 solved |
| Recurring gaps | two points missed in both OS attempts | both listed as **2/2** |
| Readiness | — | computed as a fraction of each role's question set |
| Recent | 5 submissions | 5 entries, merged and date-sorted |

The empty state was also confirmed to return valid data rather than erroring. The test account and all its rows were deleted afterwards; the database is back to its original 3 users and 9 submissions.

**Not verified by me:** the rendered page — bars, colours, tiles, the mobile grid fallback and the links back to questions have not been opened in a browser. Nor has a live text submission been made since `points` started being persisted, so the write path is verified only by typecheck and by the read path working against seeded data of the same shape.

---

## In plain English

Until now the platform could tell you what you'd answered but nothing about how you were doing. You could work through forty questions and have no idea whether your networking was weaker than your databases, or which specific things you kept getting wrong. This page fixes that.

The change that made it possible is small but was blocking everything. When the AI graded a written answer it produced a verdict on each expected point — covered, or missed, and why — showed you that once, and then threw it away. Nothing was stored except two paragraphs of prose. So there was no number to add up, no way to compare subjects, no history. Now those verdicts are kept, which means a text answer finally has a score attached to it.

The most useful thing on the page isn't the percentage, though. It's the list of what you keep missing. A score tells you that you're at 62%; a list telling you that you've failed to mention the three-way handshake in four of your last six networking answers tells you what to go and read tonight. That's the difference between a report card and something actually worth opening.

Two smaller decisions worth knowing about. Subjects are sorted weakest first, because the order is itself the advice — the thing at the top is the thing to work on. And a subject you haven't been scored in yet says "not scored" rather than showing 0%, because on a page about where you stand, "I don't know" and "you failed" must never look the same.

One honest gap: the four answers you submitted before this change have no verdicts stored, so they count as attempts but don't contribute to any score. They'll show as unscored rather than dragging your numbers down with invented values.
