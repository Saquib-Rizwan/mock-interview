# Phase 12 — voice answering

Status: **planned, nothing built.**

> **Numbering note.** Deployment was previously called Phase 12. It is now
> Phase 13. Voice moved ahead of it deliberately — see *Why this goes before
> deployment* below. Nothing about the deployment plan changed apart from its
> number.

A student preparing for an interview will *speak* their answers, not type them.
Every written round in this application currently requires typing, which trains
the wrong muscle. This phase lets an answer be spoken.

The rule for the whole phase, as in Phase 11: **nothing that currently works may
stop working.** Typing remains the primary path and must be untouched when voice
is unavailable, unsupported, or broken.

## The decision that shapes everything: dictation, not conversation

Two designs were considered.

**Conversational** — a real-time voice model conducts the round, asks the
question aloud, listens, and asks follow-ups. This is technically available:
Gemini's Live API is generally available with native audio, and it supports
*ephemeral tokens*, meaning the browser opens a WebSocket directly to Google and
audio never passes through our server. Latency would be good and the server cost
would be near zero.

**It was rejected on running cost**, and the rejection was the user's call.
Live audio is billed per audio token in both directions — cents per session
rather than dollars, but it is the **first thing in this project that scales
with usage**. Everything else costs the same whether one student uses it or
fifty. For a personal project on student credit that is the wrong shape of bill
to take on, and no feature here justifies it yet.

**Dictation** — the browser transcribes speech to text, the text lands in the
existing answer box, and the existing pipeline grades it. Free, no key, no
service, no per-use cost at any scale.

### What dictation gives up, precisely

**Follow-up questions.** That is the entire list.

Speaking the answer, hearing the question read aloud, and answering hands-free
all survive. For a DBMS or OS round that is the whole feature — nobody needs a
conversational partner to be asked what third normal form is. The conversational
version only ever mattered for HR rounds.

### What dictation gains that conversation could not

**The transcript is editable before submission.** Free speech-to-text will hear
"sequel" for "SQL"; the student fixes it in two seconds and submits. A real-time
conversation has no such step — whatever it mishears is what gets graded.

Given that the grader is scored against exact expected points, an editing step
in front of it is worth more here than it would be in a general chat product.

## The separation that must hold

The scoped grader is the most carefully verified thing in this codebase. It
marks only against `expectedAnswerPoints`, cannot invent criteria, treats
student input as data rather than instructions, and persists per-point verdicts
that the whole Progress view is built on.

**Voice produces text. The existing pipeline judges the text.**

```
speech → transcript → (student edits) → POST /submissions → existing scoped grader
```

Nothing about grading changes. No new prompt, no new model, no new service. The
voice layer stops at the answer box, and everything downstream of the answer box
is code that Phases 4, 7 and 9 already verified.

This also means the conversational upgrade stays cheap to add later: it produces
the *same handoff*. Live would become a second way to fill the same box, not a
rewrite.

## What this phase covers

| # | Item | Kind |
|---|---|---|
| 1 | `Submission.inputMode` | schema |
| 2 | Speech-to-text hook over the Web Speech API | frontend |
| 3 | Mic control on the written-answer form | frontend |
| 4 | Technical-term normalisation | frontend |
| 5 | Question read aloud | frontend |
| 6 | Graceful degradation when unsupported | frontend |

## 1. The one schema change

**`Submission.inputMode` — an enum of `typed` / `spoken`, nullable.**

Nullable because submissions made before this existed have no answer to give.
Those read as unknown rather than being assumed typed, which is the same choice
`points` made in Phase 7 and for the same reason: an invented value is worse
than an absent one.

It earns its place because it answers a question a student will actually ask —
*do I score worse speaking than typing?* Spoken answers are shorter and less
structured than written ones, and if grading turns out to be harsh on them, this
column is the only way to find out. For someone preparing for a viva, "you lose
about a point when you speak" is a genuinely useful thing to be told.

### The column that is deliberately **not** being added

A conversational round produces a *dialogue*, not an answer, and would want the
full turn list stored beside the text — a `transcript Json?`.

**It is not being added**, on the precedent Phase 11 set for sectional cut-offs:

> a cut-off that cannot be enforced is a column that lies by implication

A `transcript` column with no conversation to put in it holds null indefinitely
and implies a capability that does not exist. It gets added the day there is a
dialogue to store, in the same migration as the feature that produces one.

This is the whole schema change. One nullable enum column.

## 2. Speech to text

The browser's **Web Speech API** (`SpeechRecognition`). Free, built in, no
account, no key, no request to any service of ours.

A `useSpeechRecognition` hook wrapping it, handling the three things a naive
implementation gets wrong:

**Interim versus final results.** The API emits guesses continuously and revises
them. Interim text is shown live but greyed, and only finalised text is appended
to the answer. Without the distinction the box flickers as the engine changes
its mind mid-sentence.

**The silence cutoff.** Recognition stops on its own after a stretch of quiet.
Left alone this silently drops the end of a long answer — and thinking for a few
seconds mid-answer is exactly what an interview candidate does. The hook
restarts recognition automatically while the mic is still on, and stops only
when the student stops it.

**Accumulation across restarts.** Because of the restart, finalised text has to
accumulate outside the recognition session, or every restart loses what came
before it.

## 3. The mic control

A mic button beside the existing answer box on the written-answer form in
`pages/QuestionDetail.tsx`. That page already holds the answer in a single
`answer` state with a controlled `<textarea>`, so dictation appends to the same
state that typing writes to and needs no new plumbing.

**Speaking and typing are the same field.** Dictate a paragraph, fix a word by
hand, dictate more. There is no voice mode to enter or leave, and no separate
submission path — `POST /submissions` is unchanged apart from carrying the
`inputMode` flag.

**Scope: written answers only.** Not MCQ, which has no text to dictate, and not
coding — nobody dictates a `for` loop. The mic does not appear on either.

## 4. Technical-term normalisation

Speech-to-text reliably mangles the vocabulary this application is made of:
`SQL` → "sequel", `NoSQL` → "no sequel", `MySQL` → "my sequel".

This matters more than ordinary transcription noise. The grader was taught in
Phase 11 to forgive typos and shorthand — rules 6 and 7 in `ml-service/app/llm.py`
say to grade substance, not presentation. But "sequel" is not a typo; it is a
different word, and a point about SQL may genuinely fail to register.

A small, conservative substitution map runs over finalised text. Conservative is
the operative word: only terms that are unambiguous in this context, applied on
word boundaries. Anything requiring context to disambiguate is left alone and
fixed by the student, because a wrong automatic correction is worse than a
visible wrong transcription.

## 5. The question read aloud

`SpeechSynthesis`, over question text already in the database. No model call, no
generation, no cost, no latency — it is text we already have, spoken.

This is the cheapest item in the phase and possibly the largest change in how
the round *feels*. Hearing the question rather than reading it is most of what
separates practising an interview from filling in a form.

## 6. Degrading gracefully

Web Speech is **Chrome and Edge only**. Firefox does not implement it and Safari
is partial.

The capability is feature-detected. Where it is missing the mic button is not
rendered at all — no disabled control, no error, no explanation of a feature the
student cannot use. The page is exactly what it is today.

**Voice is strictly additive.** Every path through this phase that fails, falls
back to typing, which is the path that exists now.

## Why this goes before deployment

Two reasons, both about cost rather than preference.

**The migration is free today.** `Submission` currently holds only the user's
own test data. The same column added after launch is a migration against real
student history, with a backup step in front of it. One nullable column is not
frightening either way, but free is free.

**Voice needs HTTPS and must not ship without it.** Neither microphone access
nor Web Speech runs outside a secure context. On `localhost` they work, which is
why this can be built and tested now; on a plain `http://` deployment they would
silently do nothing. Phase 13 is Caddy with automatic HTTPS, so building voice
first means the deployment ships with a working feature rather than a dead
button — and it puts a hard requirement on the deployment that would otherwise
have been a preference.

## What this does not touch

- Grading, in any respect: no prompt change, no model change, no new criteria
- The ml-service, which is not called differently and not called more
- MCQ assessments and coding rounds, neither of which gains a mic
- `answerText`, which is still a plain string that arrives by `POST /submissions`
- Any existing submission, which keeps a null `inputMode` and displays as it does now

## Known limitations, accepted going in

- **Chrome and Edge only.** A real gap for anyone else, accepted because the
  alternative is a paid transcription service and this phase exists to avoid one.
- **Accented English with technical vocabulary is the weak point.** The
  normalisation map covers the predictable failures; the editable transcript
  covers the rest. Paid speech-to-text would be materially better here, and this
  is the specific quality gap that a future upgrade would close.
- **Chrome's implementation is not local.** It sends audio to Google for
  recognition. No account or key is involved and nothing is stored by us, but it
  is not offline and should not be described as private.
- **No conversation.** Deferred on cost, not on difficulty. The handoff shape is
  designed so it can be added without rework.

## What I have **not** verified

Nothing has been built. Everything above is a plan.

The specific things that will need checking once it is:

- Whether restart-on-silence actually preserves a long answer, which is the item
  most likely to be subtly wrong
- Whether the normalisation map ever corrupts a correct transcription
- Whether the grader scores spoken answers materially lower than typed ones,
  which is exactly what `inputMode` exists to reveal and cannot be answered
  until there is data
