# Phase 9 — Catalogue expansion

Status: **every pool authored to target, six companies added.**
`os`, `cn`, `oops`, `general_hr` and `aptitude` are at **40 questions each** and
`dbms` at **43**, up from 15 (and 8 for aptitude). No pool is thin any more.
**Aays**, **Abilytics**, **Alfaedge**, **Anora Labs**, **Armada** and
**Cloudium** are written from the placement-cell material (sections 5, 8 and 9),
taking the catalogue to **16 companies, 19 roles and 65 rounds**. Between them,
Abilytics and Anora supply everything Phase 10 was blocked on.

The insight that shapes the phase: **company breadth multiplies against pool
depth.** The pools were 15 questions each in `os`, `dbms`, `cn`, `oops`,
`general_hr`, and 8 in `other`. Ten companies and 13 roles already drew from
those same 15, so adding companies alone would have shown every student the same
questions. Companies and questions grow together or not at all.

Worth recording precisely because it was nearly missed: **ingestion alone changes
nothing a student sees.** `ingest-questions` only fills the shared bank;
`seed-catalog` is what walks each round and draws from that bank, and its rolling
per-pool cursor is the mechanism that stops two companies showing the same
questions. Deepening a pool is only half the operation — the catalogue has to be
re-seeded afterwards or the new questions sit unused.

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

## 4. Authoring the core pools, 15 → 40

Source material was four sets of subject notes the user supplied as PDFs — OS,
DBMS, CN and OOPS — complete with worked explanations, MCQs and answer keys.
Having the answers mattered: marking points are derived from a source of truth
rather than invented, which is the difference between a defensible scheme and a
plausible-sounding one.

Written in two batches per subject, 10 then 15:

| File | Adds |
|---|---|
| `os-batch-2.json`, `os-batch-3.json` | deadlock (conditions, strategies, Banker's), synchronisation (critical-section requirements, Peterson, hardware primitives, monitors, producer-consumer, dining philosophers, readers-writers), memory (MMU/TLB, paging, segmentation), disk and file allocation, schedulers, IPC |
| `dbms-batch-2.json`, `dbms-batch-3.json` | CAP, tier architecture, ER modelling, normalisation 1NF–3NF, lossless join vs dependency preservation, conflict serializability, schedule recoverability, timestamp and optimistic concurrency, recovery, views, subqueries, indexes, query optimisation, data protection |
| `cn-batch-2.json`, `cn-batch-3.json` | TCP handshake and TCP vs UDP (both were genuine holes), routing protocols, CIDR, DNS, HTTP, mail protocols, topologies, framing, Hamming, access and channelization protocols, Ethernet frame, headers, FLSM vs VLSM |
| `oops-batch-2.json`, `oops-batch-3.json` | virtual destructors, why constructors cannot be virtual, object slicing, friend classes, static members, inheritance modes, operator overloading, garbage collection, overriding rules, casting, composition vs inheritance, aggregation vs composition |

**Nothing is copied.** Facts come from the notes; every question and every marking
point is written fresh. This repository is public and the notes are paid course
material carrying a watermark, so the same rule already applied to LeetCode
statements applies here.

### Two errors in the source material

Both were contradicted rather than reproduced, and both were reported to the user:

- The DBMS notes state on one page that UPI wallet payments favour **consistency
  and availability**, while their own MCQ answer key for the same scenario says
  **consistency and partition tolerance**. The answer key is right — during a
  partition you cannot have both C and A, which is the entire content of the
  theorem.
- The CN notes describe a **"0-persistent CSMA"** as priority-based with a
  predefined transmission order. The standard third mode is **non-persistent**
  CSMA: if the channel is busy, wait a random interval and sense again. The
  standard definition was used.

### Duplicate control

Two passes ran before anything was accepted: exact-text matching against every
existing question, and a Jaccard token-overlap scan against all prior questions
in the same category. The scan caught two genuine collisions in batch 3 — a
sharding question that duplicated an existing one almost entirely, and a
method-overriding question that made three overlapping questions in that area.
Both were replaced rather than trimmed. Highest remaining similarity is 0.40,
between *what an interface is* and *when to choose one over an abstract class*,
which are different questions.

## 5. First company from the placement material — Aays

Source: the college training-cell document (PRABANDHA), four pages on **Aays**,
*Associate Data Engineer*, all branches eligible, 2 students placed. The first
catalogue entry written from real material rather than from general knowledge of
a company's process, and it is unusually complete — it names the four rounds,
the attrition at each stage, a difficulty rating per round, and thirteen
questions actually asked.

### The rounds, and one judgement call

| # | Type in the schema | Round | Questions |
|---|---|---|---|
| 1 | `other` | Resume Shortlisting | 0 |
| 2 | `technical` | AI Evaluation Interview | 4 picks |
| 3 | `technical` | Technical Interview | 4 `dbms` + 2 `dsa` coding + 4 specific |
| 4 | `managerial` | Managerial Round | 3 specific |

Round 1 is the judgement call. It is a real round — around 11 of the applicant
pool survive it — but it is a resume screen, so there is nothing to answer. The
options were to omit it, or to carry it with zero questions. Omitting it loses
the most actionable fact in the document, which is that generic resumes are
filtered out before any test. So it is carried, with the substance in `notes`.

That exposed a copy bug: `RoundDetail` said *"No questions attached to this
round yet"* for an empty round, which reads as a seeding failure rather than as
a round that legitimately has none. Now reads *"No practice questions for this
round — what to prepare is in the note above."*

Round 2 is an **AI-driven interview that replaces the aptitude test**. Worth
recording because it breaks an assumption the catalogue was carrying: that a
first round is a written test. It is mapped to `technical`, not `aptitude`,
because the document is explicit that it is not an aptitude test.

### Where each documented question went

The document lists thirteen questions. They did not all belong in the same
place, and deciding that was most of the work.

Six are generic SQL and databases. Three of those were **already in the `dbms`
pool** — second-highest salary, the join types, and normalisation through 3NF —
so Aays' rounds draw them from the pool rather than duplicating them inline. The
other three were genuine holes and went **into the shared pool**, where every
company benefits, as `dbms-batch-4.json`:

- window functions — `RANK()`, `DENSE_RANK()`, `ROW_NUMBER()`, `PARTITION BY`
- diagnosing a query that has become slow in production
- composite indexes and the leftmost-prefix rule

That takes `dbms` to 43.

Four are **data pipeline** questions — end-to-end walkthrough, mid-run failure
recovery, fault tolerance and idempotency, duplicate handling. These have no
pool category. `dbms` would be wrong; they are data engineering, not databases.
They stay inline as `specific`, which is the agreed pattern and needs no schema
change. **If a second data role arrives, this becomes the argument for a
`data_engineering` category** — one company does not justify one.

Three are managerial, and are inline for a different reason: see below.

### The duplicate scan changed the design

Running the Jaccard scan over the ten new questions against all 277 pool rows
surfaced one real defect. All three of Round 4's documented questions are near
restatements of questions already in `general_hr`:

| Documented (Aays) | In the pool | Overlap |
|---|---|---|
| Why do you want to work at Aays specifically? | Why do you want to join this company? | 0.42 |
| Tell me about yourself and your interest in data engineering. | Tell me about yourself. | 0.40 |
| How do you handle working under pressure or with ambiguous requirements? | How do you handle pressure and tight deadlines? | 0.36 |

Round 4 was also drawing three `general_hr` picks, so a student could have been
shown both halves of a pair in the same round. **The picks were removed.** The
document states exactly what this round asks; three documented questions beat
three random draws that might restate them. Generic HR practice is available
from nine other companies.

This is the first time the duplicate scan changed a structural decision rather
than replacing a question, and it is the argument for running it on every batch:
the collision was invisible in the JSON and would only have shown up in the
browser, in one round out of forty-nine.

The remaining hits were all in the 0.25–0.31 band and all stopword-driven —
*"what is a X, and how does it differ from Y"* matches itself across every
subject. The threshold is tuned to over-report; that is the correct direction
for it to be wrong in.

### The logo is traced from the source, and the mark turned out to be exact

Aays is not in simple-icons, where the other five logos came from. The first
attempt approximated their dot-ring mark geometrically and got the structure
**backwards** — largest dots outward, filled centre. The real mark is the
opposite.

So it was traced instead. The logo was isolated from the placement-document
screenshot (63x64 px), thresholded on luminance, and every dot recovered as a
connected component with a sub-pixel, ink-weighted centroid and an area-derived
radius. Converting those 64 centroids to polar coordinates about the centre of
mass showed the mark is perfectly regular:

| Ring | Dots | Radius | Dot radius | Phase |
|---|---|---|---|---|
| 1 | 16 | 15.82 | 1.99 | 0.0° |
| 2 | 16 | 20.18 | 1.31 | 11.7° |
| 3 | 16 | 24.20 | 0.83 | 1.9° |
| 4 | 16 | 28.27 | 0.55 | 12.3° |

**Four rings of sixteen, every dot on a 22.5° step, alternate rings offset by
half a step, dot radius falling outward** — 1.00 / 0.66 / 0.42 / 0.27 of the
innermost. Maximum angular residual within any ring was 0.7°, which is the
source raster at 63 px, not the design. Because the mark is built from circles,
emitting it as 64 circular subpaths is not an approximation of it — it *is* it,
and it is now resolution-independent in a way the screenshot never was.

Rendered back at 64 px against the original, it matches.

### It mushes at list size, and that is worth knowing

`.cmark svg` is 55% of the block, so logos actually render at **19–26 px**.
Sixty-four dots do not resolve at that size; the mark reads as a soft dotted
ring with a halo rather than as discrete dots, and the outer ring (0.22 units,
about a third of a pixel) effectively disappears.

A variant with the dot-size falloff compressed was rendered and compared, and it
was **worse** — lifting the small dots closed the gaps and turned the ring into a
smudge. The faithful version was kept.

This is not specific to Aays; Wipro and Zoho carry comparable detail and lose it
at the same size. The design system already accepted that trade. If it reads
badly in the browser the cheap fix is dropping rings 3 and 4 and rescaling — a
32-dot mark that keeps the character and resolves at 20 px — but that is a
deliberate simplification and should only be done after looking at the real
thing.

### The other five logos: a wrong assumption, corrected

I had recorded that Amazon, Microsoft, Deloitte, Cognizant and Capgemini were
"all in simple-icons, so those five are mechanical". **That was wrong.** Checked
against v16.28.0: it carries 3453 icons, including all five brands already in
this file, and **none of those five**. They were monograms because they were
never available, not because nobody got round to them.

The five split into three different problems, not one:

- **Microsoft — done, and it needed no source.** The mark is four equal squares,
  so it is *constructed* rather than traced: side 11.52 with a 0.96 gap, a gap of
  one twelfth of a side. Exact at any size. Rendered at 19, 21 and 26 px it is
  the crispest logo in the set — no antialiasing to lose, unlike every traced
  mark.
- **Amazon — needs a source.** The smile-arrow is a drawn curve, not geometry.
  Constructing it by hand would be exactly the approximation that was rejected
  for Aays, so it waits for an image.
- **Deloitte, Cognizant, Capgemini — a design question, not a sourcing one.**
  All three are wordmarks. At 19-26 px a monochrome wordmark is illegible, so
  even a perfect trace would render as a grey smear. The two-letter monogram is
  very likely the better mark at this size, and the fallback already produces it.

The route that works, when a source is needed, is the one Aays proved: the
placement document has each company's logo on its own page, and the trace
pipeline above turns one into exact path data. That makes logos a by-product of
adding a company rather than a separate errand.

### What the document did not say, and so is not encoded

No cut-off marks, no time limits, no section structure, no eligibility CGPA. The
document is silent on all of it, so the catalogue is too. Round 2's difficulty
rating (7/10) and Round 3's (8/10) are recorded in `notes` as prose because
`Difficulty` is a three-value enum and mapping 7/10 onto it would be inventing
precision the source does not have.

## 6. Aptitude, 8 to 40

`data/questions/aptitude-batch-1.json` — 32 questions taking the last thin pool
to target. Written in the shape the existing eight established: a word problem
ending in *"Explain your approach"*, marked against five points that follow the
solution rather than only its answer — set it up, do the arithmetic, state the
result, and one point on the trap the question exists to catch.

Coverage is the standard placement syllabus, deliberately one question per
topic rather than several per topic:

| Area | Topics |
|---|---|
| Arithmetic | successive percentages, ratio, averages, ages, SI, CI vs SI, depreciation |
| Rates | relative speed, boats and streams, pipes and cisterns, worker-days, average speed |
| Commerce | partnership by capital-time, profit and loss on two articles, mixture replacement |
| Numbers | remainders by cyclicity, LCM, arithmetic progression sum, odd one out |
| Counting | combinations, at-least-one probability, inclusion-exclusion |
| Reasoning | syllogism, seating, coding-decoding, direction, clock angle, ranking, painted cube, mislabelled boxes |
| Interpretation | percentage on a two-year table |

### Every answer is computed, not asserted

The rule that governs coding questions — *expected outputs are computed, never
hand-written* — applies at least as strongly here, because a wrong answer key in
an aptitude question is invisible until a student loses marks trusting it.

So all 32 were re-derived independently in a script rather than checked by
re-reading: exact arithmetic in `Fraction` where a decimal would round, `pow(2,
31, 7)` for the cyclicity question, `math.lcm` for the bells, `comb` for the
committee. The two pure-logic ones were brute-forced rather than argued:

- **The mislabelled boxes.** Enumerating the permutations where no label is
  correct gives exactly two worlds; drawing from the box labelled *Mixed*
  separates them, and drawing from either other box leaves an ambiguity. The
  marking scheme claims exactly this, and now it is checked rather than asserted.
- **The syllogism.** Enumerating small models found one satisfying both premises
  while falsifying the conclusion, which confirms the answer is *does not
  follow* rather than merely *probably not*.

30 numeric answers plus both logic questions verified, 0 mismatches.

### The duplicate scan does not transfer to aptitude

Run at the usual 0.25 Jaccard threshold, the scan returned **143 flags**, up to
0.50. Almost none were real. Aptitude word problems share far more surface
vocabulary than CS prose does — *"what is the"*, *"how many"*, *"explain your
approach"*, plus rupees and bare numerals — so the baseline similarity between
two entirely unrelated problems is much higher. The worst offender was *"What is
the **angle between** the hour and minute hands"* matching two dozen CS
questions of the form *"What is the **difference between** X and Y"*.

Re-running with stopwords and shared aptitude vocabulary removed, and comparing
only distinctive tokens, left **4 pairs (2 unique) at 0.31** — CI-versus-SI
against both the simple-interest question and the depreciation question. Those
are a topic cluster, not duplication: compound growth, compound decay and
solving for principal are three different mechanics.

The lesson is about the tool, not the batch: **0.25 on raw tokens is calibrated
for CS prose and over-reports badly on word problems.** For aptitude the
stopword-stripped comparison is the one to trust.

### It is still text, and that is a deliberate bet

These are graded by the LLM against five points, exactly like every other text
question. If Phase 10 later makes aptitude an MCQ assessment round, **the
question stems and the worked reasoning survive and the five-point schemes are
the part that is wasted.** That trade was accepted knowingly: the alternative was
leaving the thinnest pool at 8 while a schema decision that is deferred
indefinitely blocks it. Every aptitude round in the catalogue draws from this
pool today.

## 7. Round state on the spine

Rounds gave no signal about what had been done in them. The spine listed them in
order and every one looked identical whether you had answered all of it or none.

`backend/src/catalog/attempted.ts` answers one question — which of these
question ids has this user attempted — and both catalogue routes use it:

- `/catalog/roles/:id` returns `answeredCount` beside `questionCount` per round
- `/catalog/rounds/:id` returns `attempted` per question

"Attempted" means a `Submission` or a `CodeSubmission` exists. Both tables have
to be asked because they are deliberately separate, and a round mixing written
and coding questions needs the union. **Neither is filtered on score.** This
answers *have you been here*, not *did you do well* — the progress page is what
grades, and conflating the two would make the spine imply a mastery it has not
measured.

`/roles/:id` swapped its `_count` aggregate for the question ids themselves,
since the same rows now answer both "how many" and "how many attempted"; one
lookup covers the whole role rather than one per round.

### Three states, and a fight over the accent

Done, started, and not started — *started* being the one worth separating,
because it is the only round you can usefully resume.

The devices differ per list, per the Phase 8 rule that uniform rows read as
generated: the spine node **fills solid ink** when a round is complete and
carries a **thick accent rule** when it is part-done, while an attempted
question in the round listing gets a **thick accent rule in the margin** instead.

One real trap surfaced. `.spine-item:hover .spine-node` already fills the node
with the accent, so a done-state rule at higher specificity would have beaten
hover and the accent would have meant two different things at once. The state
selectors are therefore written as `li.is-done .spine-node` — two classes, not
three — so they sit *below* hover and lose to it deliberately. On this page the
accent means the cursor and nothing else.

Every question row reserves the 3px rule whether or not it is filled, so
answering a question changes a colour and never the layout.

## 8. Abilytics and Alfaedge

Two more companies from the same placement document, and between them they broke
two assumptions the catalogue was quietly carrying.

| | Abilytics | Alfaedge |
|---|---|---|
| Role | Software Engineer / DevOps Engineer | Software Engineer |
| Rounds | 4 | 2 |
| Placed | 2 | 3 |
| Questions | 25 | 14 |

**Abilytics** runs the process the catalogue was built to expect: MCQ screen,
coding round, technical interview, final round. **Alfaedge runs none of it** —
its document says explicitly that there was *no aptitude test, no coding round
and no group discussion anywhere in the process*. Resume shortlisting led
straight into two interviews, both heavily project-driven, on the same day.

That is worth recording because a catalogue built only from companies like
Abilytics would teach students that every process has a test in it. Alfaedge is
the counter-example, and it is a two-round process that placed three people.

### Abilytics Round 1 is the data Phase 10 was waiting for

The Phase 10 deferral above lists exactly what was missing. Abilytics supplies
most of it:

| Needed | Abilytics says |
|---|---|
| Duration | 45 minutes |
| Per-section or overall timer | Not stated |
| Sections and counts | Topics listed, counts not stated |
| Negative marking | **Yes** — "attempt only when confident" |
| Revisit questions | Not stated |
| Per-section cut-off | Not stated |

So Phase 10 is **unblocked but not fully specified**. Enough to design an
`AssessmentAttempt` around — timed, negative marking, whole-test grading — but
still silent on sectioning, which was the structural variance that caused the
deferral in the first place. One more company with a sectioned test would settle
it. **Nothing was built for it here**, deliberately: the brief was to add
companies without disturbing what works.

### The format gap is recorded, not papered over

Abilytics Round 1 is mapped to `roundType: aptitude` and draws written questions
from `aptitude`, `oops`, `cn` and `dbms`. That is a genuine mismatch — the real
round is multiple choice under negative marking — and the round `notes` say so
in as many words: practising these builds the knowledge but not the speed or the
guess-discipline the real round tests.

Writing that down was the alternative to two worse options: silently pretending
a written round is an MCQ round, or leaving the company out until Phase 10 lands.

### Where the documented questions went

The same rule as Aays. Generic with a pool home goes to the pool; company-specific
or homeless stays inline.

**To the pool** — three DSA concepts that were genuine holes, since `dsa` held
only coding questions and no text at all, plus three more added so two rounds
drawing from it do not overlap (`dsa-concepts-1.json`, 6 questions): the
two-pointer technique, the browser back-button data structure, reversing a string
in place, array versus linked list, stack versus queue, and working out time
complexity.

**To the pool** — the two classic puzzles Alfaedge asked (`aptitude-batch-2.json`),
taking aptitude to 42: the **9-balls balance problem** and the **two-ropes
45-minute problem**. Both are generic classics rather than company property, so
they belong in the shared pool; Alfaedge's round notes name them explicitly so
the connection is not lost when the cursor hands them to someone else.

**Inline** — DevOps and CI/CD. There is no `devops` category and adding an enum
value is a two-migration schema change, which is exactly what "do not break the
working nature" rules out. It sits as an Abilytics `specific`, the same treatment
Aays' data-pipeline questions got. **If a second company asks DevOps, that is the
argument for the category**; one company is not.

**Inline** — the four CEO questions, the coding-round follow-up, and Alfaedge's
five project-interrogation questions plus its three behavioural ones.

### One overlap accepted rather than removed

The scan flagged the same collision shape as Aays: managerial specifics reading
as longer versions of `general_hr` pool entries — *"Where do you see yourself in
five years, and how does this role fit"* against the pool's *"Where do you see
yourself in five years?"* at 0.50.

Abilytics Round 4 takes no `general_hr` picks, so those cannot meet in one round.
**Alfaedge Round 1 keeps its picks and accepts the risk**, which is a different
call from the one made for Aays, for a reason: Aays' document enumerated its
final round completely, so pool draws could only restate it. Alfaedge's says
there were behavioural questions *and* names two, so generic HR still adds
something the document does not cover. The residual overlap is *"why join this
company"* against *"why a startup and not a big company"* — lexically close,
genuinely different questions.

### One logo in, one deliberately rejected

**Abilytics is a hummingbird** and traced cleanly. The source is a colour
gradient, so the mask was taken on saturation rather than darkness, upscaled 6x,
and run through potrace for real Bezier curves — two subpaths, body-with-tail and
the upper wing. Re-rendered against the source mask it matches. At 19, 21 and 26
px it stays recognisably a bird, because a solid silhouette survives where Aays'
64 dots did not.

**Alfaedge is a wordmark and was rejected on evidence.** It traced fine — 18
subpaths, 5,302 characters — but the mark is 3.6:1, so fitted into a 24-wide box
it is under six units tall and every letter lands on about two pixels. Rendered
at all three real sizes it is an unreadable grey smear. The letter monogram is
genuinely the better mark here, and the fallback already produces it. The
wordmark carries a small rocket in its "g" which would read at size, but Alfaedge
is not known to use it standalone, and inventing an icon mark for a company is
the same error as the first Aays attempt.

Two data points now: **silhouettes trace and survive, wordmarks trace and die.**
That is the rule to apply to the remaining monograms rather than tracing them all
and looking afterwards.

## 9. Anora Labs, Armada and Cloudium

Three more, taking the catalogue to **16 companies, 19 roles, 65 rounds**. The
instruction for this batch was CS roles only, so Anora's electronics and
mechanical content is flagged where it exists but not encoded.

| | Anora Labs | Armada | Cloudium |
|---|---|---|---|
| Role | Trainee Engineer | Technical Intern | Software Engineer Trainee |
| Rounds | 3 | 4 | 3 |
| Placed | 2 | 3 | 1 |
| Questions | 16 | 19 | 15 |

### Anora Round 1 finally settles Phase 10

Abilytics unblocked the MCQ decision but left sectioning open, which was the
exact structural variance that caused the deferral. **Anora supplies it.** Its
Round 1 is one assessment made of three consecutive sections, each with its own
timer and its own question count:

| Section | Time | Questions | Kind |
|---|---|---|---|
| 1 | 75 min | 65 MCQ (50 core technical + 15 aptitude) | single mark each |
| 2 | 30 min | 5 | coding, text editor, **no compiler** |
| 3 | 15 min | 15 | psychometric, Highly Agree to Highly Disagree |

That is the shape a flat `AssessmentAttempt` would not survive, and now there is
a real example to design against rather than a guess. Two companies also differ
on marking — Abilytics applies negative marking, Anora is single mark each — so
that has to be per-assessment rather than global. **Still nothing built for it**;
the standing instruction is to add companies without disturbing what works.

Anora's paper is also **branch-specific** (about 2 hours for EC, 1.5 for ME),
which is a further wrinkle: the same round is not the same test for every
candidate.

### Two more assumptions broken

**Armada is CGPA-gated at 9.0** — the first hard eligibility criterion in the
catalogue, and the first case where a student can be ineligible before any round
exists. Its Round 1 shortlisting is unusually strict too: only candidates who
*completely* solved both problems advanced, so partial credit was worth nothing.
Both facts live in the round notes; neither is modelled, and an eligibility field
would be a schema change.

**Cloudium's Personality Test is the second zero-question round**, after Aays'
resume screen, and it is explicitly not an elimination stage. The empty-round
copy fixed in section 5 now earns its place twice.

### CS-only, and saying so

Anora's Round 2 runs two panels — Analog and Circuit Design, and Digital
Electronics and Programming — and its Round 1 technical section is mostly EC or
ME core. Per the instruction for this batch, none of that is encoded. What is
encoded is the part a CS candidate actually faces: C programming and logic
writing without a compiler, the project and resume discussion every candidate
gets, the general aptitude, and the HR round.

The round notes say plainly that the heaviest part of Section 1 is EC or ME
material not covered here. **That matters more than usual**: a CS student reading
a thin round description could otherwise conclude the paper is easy, when in fact
most of it is a syllabus they have never studied. Recording the gap is the
honest version of filtering it out.

### The dsa text pool went from zero to ten

`dsa` held 66 coding questions and **no text at all**, which is why the
two-pointer and back-button questions from section 8 had nowhere to go. It grew
in two steps as demand appeared — 3, then 6 so two rounds would not overlap, then
10 once six companies were drawing from it. Ten questions against exactly ten
draws across the catalogue is one clean cycle with no repetition: hash tables,
recursion against iteration, binary search, sorting, two pointers, the browser
back-button, reversing a string, array against linked list, stack against queue,
and working out time complexity.

Aptitude also gained two, to 44 — a calendar question and a circular-track speed
question, both named in Anora's Section 1 topic list and both absent. Both
answers were verified by computation, including cross-checking 15 August 1947
against `datetime` as well as by the odd-days method.

### Logos: two icons in, one monogram, and the rule holding

**Anora Labs and Armada both use an icon-plus-wordmark lockup**, so what is
traced is the icon alone — the graphic element their own designers drew to stand
apart from the text. The split point was found from the column ink profile rather
than by eye: a three-pixel gap at x=37 for Anora's pulse trace, and x=21 for
Armada's two sails. That is a different act from inventing a mark for a company
that has none, which is what the first Aays attempt did wrong.

**Cloudium is a wordmark end to end** — no icon, just "cloudium" with a macron
over the i — so it takes the monogram, exactly as Alfaedge did.

The section 8 rule has now held four times: **silhouettes and icons survive at
19-26px, wordmarks do not.** Both new icons were rendered cream-on-ink at all
three real sizes before being committed, and both read clearly.

## 10. Eligibility as data, and browsing at scale

Done **before** the next batch of companies rather than after, and that ordering
is the whole point. The cheapest moment to add a field is before you enter fifty
records, not once they are all in: every company added from here carries
eligibility from the start, because whoever is reading that page is already
looking at the line that states it. Retrofitting means reopening sixty-odd
documents.

The trigger was a measurement. At 16 companies the pools cycle roughly once; at
66 they cycle 4 to 6 times, meaning **about every sixth company would draw an
identical `general_hr` round**. But the sharper number was that inline specifics
average only **2.3 per company** — most companies are almost entirely pool
draws, and pool draws are the part that repeats. The fix for that is to encode
more of each company's documented questions, not to grow the pools forever.

### Three states, not two

Eligibility went on `Role` rather than `Company`, because the material states it
per drive and several companies here run two roles.

| Field | Meaning |
|---|---|
| `openToAllBranches` | the source explicitly said "All Branches" |
| `eligibleBranches: []` | the source said nothing — **unknown**, not open |
| `minCgpa: null` | no cutoff stated — **not** "there is no cutoff" |

Three fields rather than one because there are genuinely three states. A document
that *says* "All Branches" is telling a mechanical student they may apply; a
document that is *silent* tells them nothing. Collapsing those into one empty
list converts an absence of information into a claim, which is the single thing
this catalogue is not allowed to do.

The proof that it matters is in the current data: **only 6 of 19 roles have any
eligibility recorded.** The other 13 predate the placement material entirely.
Rendering those as "open to all" would have been a fabrication applied to two
thirds of the catalogue.

### One migration this time, and why

`20260825160000_add_role_eligibility` is a single migration, unlike the aptitude
split at `20260812130633`. Nothing here adds an enum value, so there is no
Postgres restriction on using a new value in the transaction that creates it.
Three plain column adds, all defaulted or nullable, so existing rows need no
backfill and nothing breaks mid-deploy.

### The filter rule, and where the user overrode it

The first implementation refused to filter on an unstated criterion at all, and
tagged every such row *eligibility not recorded*. **The user changed this**: drop
the per-row label, and assume 7.5 where no cutoff is on record.

It is implemented as `ASSUMED_MIN_CGPA` in `pages/Companies.tsx` — a
**filter-layer constant, not data**. `minCgpa` stays null in the database and
`catalog.json` still claims no cutoff it was not given, so one number changes
every unrecorded role at once and a real figure overrides it automatically. Where
a role does have eligibility recorded, both pages show it; where it does not,
they now say nothing rather than announcing the gap on every row.

**The objection, recorded because it will matter later:** the unrecorded set is
mostly the large service companies — TCS, Infosys, Wipro, Cognizant, Capgemini —
and in practice those run the *lowest* cutoffs of anyone in the catalogue, often
6.0 to 6.5. Assuming 7.5 therefore hides exactly those companies from students in
the 6.5 to 7.5 band, who are the people those companies actually hire. The
default is wrong in the direction that costs the most. It is confined to one
constant precisely so that lowering it, or recording the real figures, is a
one-line fix.

Branch is treated differently and still never excludes: there is no sensible
default for *which branches does this company take*, so an unrecorded role stays
visible to everyone regardless of the branch filter.

Armada, at CGPA 9.0, is the only role with a cutoff actually on record.

### Filtering happens in the browser

`/catalog/companies` now returns each company's roles in full rather than a
count. At sixty-plus companies that is a few hundred short strings — far cheaper
than a request per keystroke, and search stays instant. Search matches role names
as well as company names, so *"data engineer"* finds Aays without the student
knowing which company that is.

### One design trap avoided

The filter controls do **not** reuse `.field`. That class carries the vermilion
registration marks, which exist to mark the one thing a student actually does on
this site — write an answer. Spending that device on three filter inputs would
have made it furniture, and it would have stopped meaning anything on the page
where it earns its keep.

A smaller one: the label is a **sibling** of its input, not its parent. The
global `label` rule sets uppercase at 0.68rem and `input` declares `font:
inherit`, so nesting would have rendered whatever the student typed in tiny
capitals.

## What I verified

- Both migrations applied; category counts confirmed by querying the database
- The group-discussion row survived in `other`, as designed
- Importer run against five problems covering arrays, strings, pointer types and
  a design problem
- Generated signatures compared against existing hand-written ones and match
- Backend typechecks; frontend builds and lints clean
- Generated Prisma client contains both `aptitude` and `patterns`

## What I have **not** verified

- **Batch 3 has not been ingested.** The 60 questions in the `*-batch-3.json`
  files are validated as JSON, checked for duplicates and typechecked against the
  schema, but they have not yet been loaded into a database or seen in the
  browser. Batch 2 has, and the user confirmed it working.
- **No marking scheme has been graded against a real student answer.** The
  schemes are written to be sharp and non-overlapping, but whether they are
  actually fair — whether two points penalise the same gap twice — is only
  knowable by answering a question and reading the per-point verdicts. This is
  the single most important thing still unchecked, because it sets the standard
  for `general_hr` and `aptitude`.
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
- **Round state has never been rendered.** Backend and frontend both typecheck
  and the query is straightforward, but no round has been seen showing a
  done or part-done node, and the CSS specificity argument that keeps hover
  winning over the done state is reasoned rather than observed. That one is
  worth a deliberate look: it is exactly the kind of claim that is easy to get
  right on paper and wrong in a browser.
- **`aptitude-batch-1.json` and `dbms-batch-4.json` have not been ingested**,
  and Aays has not been seeded. Every answer in the aptitude batch is verified
  by computation, but computation cannot tell whether a marking scheme reads
  fairly to a student — see the point above about no scheme ever having been
  graded.
- **The traced Aays logo has been seen and approved by the user**; the round
  state and both question batches have not.

## Still to do in this phase

1. ~~Take `os`, `dbms`, `cn` and `oops` from 15 to 40~~ — **done**
2. ~~`general_hr` 15 → 40~~ — **done**
3. ~~`aptitude` 8 → 40~~ — **done**, see section 6
4. Add companies from the user's placement-cell material, batch by batch —
   **Aays, Abilytics and Alfaedge done** (sections 5 and 8); the rest await
   screenshots
5. Company logos as each is added — one line in `components/companyLogos.ts`.
   **Microsoft** (constructed), **Aays** and **Abilytics** (traced) done.
   **Alfaedge stays a monogram on purpose** — see section 8. Amazon, Deloitte,
   Cognizant and Capgemini still need source images, and on the wordmark rule
   from section 8 the last three are likely monograms for good
6. Surface "more like this" using `patterns` once tagged questions exist

### HR marking schemes work differently

Worth recording, because it is not obvious: an HR question has no correct
answer, so its `expectedAnswerPoints` cannot describe content. They describe the
**shape of a good answer** instead — whether it uses a specific example rather
than a general claim, whether it takes ownership rather than assigning blame,
whether it stays credible rather than choosing a weakness that is secretly a
strength. This follows the pattern already set by the original 15 and keeps the
LLM grading something checkable rather than judging character.

## The MCQ decision — resolved, and promoted to Phase 10

The four PDFs carry roughly 150 MCQs with answer keys. The original framing was
whether to reword them as written questions or add an MCQ question type. The
user reframed it correctly, and the reframing is the important part:

> **An interview is a conversation; an assessment is a test.** No interviewer
> reads four options aloud. MCQs belong to the *online screening round* that
> precedes interviews — the TCS NQT, the Infosys and Wipro online tests — so
> MCQ is not a question type that floats anywhere in the app. It is the format
> of a particular kind of round.

That changes the design. The consequences:

- **Format is a property of the round, not of `roundType`.** There are already 12
  `technical` rounds, and a technical round may be a written test at one company
  and a conversation at another. So format needs its own field, `roundMode`, with
  values `interview` and `assessment`.
- **`roundMode` is per-company data and must come from the user's placement
  material**, not be inferred. Where the material is silent it defaults to
  `interview`. Same integrity line as the rest of the catalogue: a missing
  assessment round is better than an invented one.
- **Grading happens on submission of the whole test**, not per question, which
  needs a session concept that does not exist today — `Submission` is one row per
  question, graded immediately.
- **The review must show worked solutions, not just the correct letter.** For
  aptitude especially, *how* you reach twenty seconds is the entire value. That
  makes each MCQ's explanation comparable labour to a five-point marking scheme.

Settled with the user: **timed** with auto-submit, **provision for negative
marking** (per-company, from their material), and **answers changeable** before
submission, which means the test UI needs question navigation rather than a
single scrolling list.

This is large enough to be its own phase — new enum, new table, new ingest
script, a third grading path and a test-taking UI — so it becomes **Phase 10**
and deployment moves to Phase 11. Aptitude authoring waits for it, for exactly
the reason the aptitude category split was done first: authoring 32 questions in
one format and then migrating them is the mistake this project keeps avoiding.

### Phase 10 is deferred, deliberately
> **Update, after sections 8 and 9: this deferral is resolved.** Abilytics gave
> the MCQ shape (45 minutes, negative marking) and **Anora gave the sectioning**
> — three consecutive sections at 75, 30 and 15 minutes with 65, 5 and 15
> questions. That was the missing structural variance. Marking differs between
> the two companies, so it belongs per-assessment rather than global, and Anora's
> paper is branch-specific, so a round is not even the same test for every
> candidate. **Phase 10 can now be designed against real data. Nothing has been
> built for it yet** — by instruction, companies were added without disturbing
> what works.



A full plan was written and then **not built**, on the user's judgement that the
assessment round is "highly undefined and varietyful for different companies".
That is the correct call, and the reason is stronger than the one originally
given for building now: what varies between companies is not only the *values*
— duration, negative marking — but the *structure*. Real screening tests are
often sectioned, with a separate timer and sometimes a separate cut-off per
section, and some forbid returning to an earlier section at all. An
`AssessmentAttempt` with one timer and one flat answer list would not survive
contact with that, and the migration would be exactly the kind this project
keeps designing around.

**What unblocks it: one company's assessment round in detail** — duration and
whether it is per section, the sections and their question counts, negative
marking, whether questions can be revisited, and any per-section cut-off. One
real example is enough to build a schema that survives the other nine; a guess
is not.

One distinction is worth preserving for whenever it does get built. Marking
existing aptitude rounds as `assessment` inside `catalog.json` would be shipping
a guess as product data, and is ruled out. A **dev-only test fixture** used to
verify the endpoints is not shipped data and does not touch the catalogue, so it
is not covered by that rule — the machinery can be verified without fabricating
anything in the catalogue.

Noted for later: the *question* format is far more stable than the *round*
format. An MCQ is options, a correct index and a worked solution regardless of
how the surrounding test is run, so authoring MCQs is much less exposed to this
uncertainty than building the session machinery is.

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

On top of those foundations, four subjects went from fifteen questions each to
forty. The questions themselves are the cheap part; what takes the time is the
marking scheme, because every question needs five separate things an answer
ought to contain, sharp enough to be checkable and distinct enough that a
student who misses one idea is not penalised twice for it. That is what the
LLM grades against, and it is the only thing standing between useful feedback
and a confident-sounding guess.

The source was the student's own subject notes, which mattered more than it
sounds: because the notes carry worked answers, the marking points could be
derived from something authoritative rather than invented. Two places where the
notes were wrong were found in the process — one where a page contradicted its
own answer key about the CAP theorem, and one where a protocol was given a
non-standard name — and both were corrected rather than repeated, since a
question bank that teaches an error is worse than one that is merely thin.
