# Project context

Placement interview preparation platform. Students pick a target company and role, work through its interview rounds (aptitude, technical, HR, coding), and answer in their own words. Written answers are graded by an LLM against a fixed marking scheme; coding questions run against real test cases in a sandbox.

Personal project — no submission deadline, no external stakeholder.

---

## How to work on this

These are the operating rules, set at kickoff and reaffirmed since. They override default behaviour.

**Phase by phase.** Work proceeds in numbered phases. Never begin a phase until the previous one is explicitly confirmed working. Never pull scope forward from a later phase — note it in the phase doc instead.

**State the plan first.** Before writing code for a phase, state the plan for *that phase only*, and pause for go-ahead if it involves a schema decision or an architectural choice not already agreed.

**Never run git commands.** State what to run and let the user run it. Asked for explicitly: *"Git just tell me what to do i will do the same."*

**Nothing is committed until the user has verified it.** A commit marks work *they* have personally checked, not work that passed automated checks. Sequence is always: build → tell them exactly what to verify → they verify → they commit. Do not stage or commit ahead of that.

**Teach, don't hand off.** When a step needs the user's own hands — a command, an env var, a cloud console click — explain what it does, what each flag means, what success looks like, and what failure would look like. These are teaching moments.

**Flag earlier-phase schema changes.** If a phase reveals that an earlier phase's schema needs to change, stop and say so rather than silently altering it.

**Keep the phase docs honest**, including limitations. They double as the project's design-decision record.

**Never ask for a secret in chat.** Have the user paste keys into the relevant `.env` (all gitignored). To verify a key, read the file in a script and print only length/prefix.

---

## Stack and layout

| | |
|---|---|
| `backend/` | Node · TypeScript · Express 4 · Prisma |
| `frontend/` | React · Vite · TypeScript |
| `ml-service/` | Python · FastAPI — the only thing that talks to an LLM |
| `data/` | Question bank and the company catalogue, as JSON |
| `docs/phase-log/` | One document per phase. Read these before changing anything |

**Ports deviate from the defaults deliberately** — another project on this machine uses 5432 and 8000:

- Postgres **5433**, backend **4000**, frontend **5173**, ml-service **8001**

**Running it:** `docker compose up -d`, then `npm run dev:backend`, `npm run dev:frontend`, and for ml-service `.\venv\Scripts\Activate.ps1` then `uvicorn app.main:app --reload --port 8001`.

Express 4 ignores rejected promises from async handlers — everything async must go through `src/asyncHandler.ts`.

---

## Decisions that should not be re-litigated

**Judge0 needs cgroup v1, which this Windows machine cannot provide.** Docker Desktop and WSL2 both mount cgroup v2 with no override; two experiments proved it. It runs on an **Azure for Students VM** (`judge0-vm`, resource group `mock-interview-rg`, centralindia zone 2) which has a real GRUB bootloader. Also ruled out: DigitalOcean (wants a card — the user won't add one anywhere), RapidAPI-hosted Judge0 (free tier gone), Piston, Sulu.

The VM is normally **deallocated** to save credit. Wake it with `az vm start -g mock-interview-rg -n judge0-vm`. Only coding rounds need it. The firewall pins Judge0's port to the user's home IP — if Judge0 goes unreachable, check whether that IP changed before debugging anything else.

**Grading criteria never reach the client.** `expectedAnswerPoints` is absent from every catalog response; hidden test cases never send inputs or expected values. This is load-bearing, not incidental.

**The LLM is scoped and must stay scoped.** It grades only against supplied points, cannot invent criteria, and treats student input as data rather than instructions. Code review is told the test verdict and forbidden from contradicting it. All three properties are verified in the phase docs — don't loosen them.

**One generated program runs all test cases**, not one Judge0 submission each — compilation dominates for C++ and Java. Test inputs are embedded as native literals, which is why C++ and Java need no JSON parser. `ListNode` and `TreeNode` travel as arrays.

**Expected outputs are computed, never hand-written.** Coding questions are authored as drafts with a Python reference solution; `npm run expected` runs it and records what it produces. A wrong answer key is the worst possible defect here.

---

## Current state

Phases 0–7 complete and committed, plus a security hardening pass that wasn't in the original brief.

- Auth with real token revocation (`User.tokenVersion`), CORS allowlist, rate limiting on auth/execution/LLM
- LLM-graded written answers with per-point verdicts, now persisted
- Sandboxed execution in Python, JavaScript, C++, Java — including linked lists and binary trees
- 10 companies, 13 roles, 45 rounds, 164 questions, 396 test cases
- Progress view: subject coverage, recurring gaps, coding pass rates, company readiness

**In flight:** the UI redesign — **"Vermilion"**, a two-colour poster system (deep ink `#14131A`, cream `#F5EDE0`, vermilion `#FF4A1C`; Syne + Chivo + JetBrains Mono). Built and approved by eye against a static preview, **not yet run against the real app**. See `docs/phase-log/phase-8-ui-redesign.md`, which records the three directions that were rejected first and why — do not re-propose them. `docs/design-brief.md` is historical.

Load-bearing rules from that redesign: the display face **never** sets numbers (mono does, with `lining-nums`); the accent appears only in solid blocks and thick rules; every list has a deliberately different device, because uniform rows read as generated.

**Open, not started:** deployment to a live URL on the Azure VM (Caddy + auto-HTTPS, everything same-origin), voice-based answering, more company data, ~184 remaining NeetCode questions, and a class-based harness for design problems (LRU Cache, Trie, Min Stack).

**Known rough edges** are listed honestly at the end of each phase doc. The sharpest: the hidden test-case answer key is committed to a public repo, and `QuestionCategory` is duplicated between the Prisma schema and `frontend/src/api.ts`.
