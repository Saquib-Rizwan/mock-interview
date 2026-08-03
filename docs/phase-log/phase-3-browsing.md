# Phase 3 — Company / Role / Round / Question Browsing (read-only)

Status: **complete and verified** (browse flow confirmed in the browser for both companies, 2026-08-03).

## What was implemented

**Backend** — `src/catalog/routes.ts`, mounted at `/catalog` in `src/index.ts`. Four read-only endpoints, all behind `requireAuth`:

| Endpoint | Returns |
|---|---|
| `GET /catalog/companies` | companies, alphabetical, each with a role count |
| `GET /catalog/companies/:id` | company + its roles, each with a round count |
| `GET /catalog/roles/:id` | role + parent company + rounds **ordered by `order`** |
| `GET /catalog/rounds/:id` | round + parent chain + its questions |

**Frontend**
- `src/api.ts` — catalog types and four client methods.
- `src/useFetch.ts` — shared loading/error/data hook.
- `src/components/Layout.tsx` — header with brand, current user, logout.
- `src/components/Breadcrumbs.tsx` — trail; last crumb is plain text.
- `src/components/labels.ts` — display names for the snake_case enums.
- `src/pages/Companies.tsx`, `CompanyDetail.tsx`, `RoleDetail.tsx`, `RoundDetail.tsx`.
- `src/App.tsx` — routes; `App.css` — rewritten for the browse UI.
- Deleted `src/pages/Dashboard.tsx` — the Phase 2 placeholder, superseded by the companies list per the brief ("Dashboard page: lists companies").

No schema changes. No new dependencies.

## Why this approach

**Every response includes its parent chain.** `GET /roles/:id` returns the company, `GET /rounds/:id` returns role *and* company. Breadcrumbs then render from one request instead of three chained round-trips, each of which would need its own loading state. The extra payload is two short strings.

**`expectedAnswerPoints` is excluded from the API, not just hidden in the UI.** It is the answer key. A student browsing practice questions who can open devtools and read the expected points gets no practice value. Omitting it server-side means the UI cannot leak it by accident. Phase 4 will use it server-side for grading, where the student never sees the raw list. This is a judgment call the brief did not specify — flagged here because it is a deliberate narrowing of "shows its questions".

**All catalogue routes require auth.** The brief did not say, but this is a student practice platform and Phase 2 established login. `catalogRouter.use(requireAuth)` applies it once at the router rather than per route, so a future endpoint cannot be added unprotected by forgetting a line.

**Counts come from Prisma's `_count`,** not by fetching children and measuring the array. The list page needs "4 rounds", not the rounds themselves; `_count` becomes a SQL `COUNT` rather than transferring rows to throw away.

**Rounds are explicitly `orderBy: { order: "asc" }`.** Without it, PostgreSQL returns rows in no guaranteed order — which often *looks* like insertion order in development and then silently breaks. Phase 1 made ordering explicit in the schema; this honours it in the query.

**`useFetch` takes a stable function reference, not a closure.** The natural shape is `useFetch(() => api.company(id), [id])`, but an inline arrow is a new value every render, so it cannot honestly be an effect dependency — which produced lint warnings that only a suppression could silence. Passing `api.company` directly works because `api` is a module-level object created once, so its methods are stable and can be real dependencies. The result has no lint suppressions anywhere. The hook also ignores responses that arrive after the user has navigated away, which otherwise shows the wrong record.

**Enum display names live in `labels.ts`.** The database stores `group_discussion`; the UI shows "Group Discussion". A `Record<RoundType, string>` means adding an enum variant without a label becomes a TypeScript error rather than a raw snake_case string appearing on screen.

## How it works

```
/                 Companies      → tiles, each linking to a company
/companies/:id    CompanyDetail  → that company's roles
/roles/:id        RoleDetail     → rounds, numbered, in order
/rounds/:id       RoundDetail    → the questions in that round
```

Each page is wrapped in `<Private>` in `App.tsx`, which composes `ProtectedRoute` (redirect to login if no valid token) with `Layout` (header). Composing once means a new browse route cannot accidentally be added unguarded or unstyled.

The round page is where the Phase 1 join table becomes visible: questions arrive already flattened out of `RoundQuestion`, so a company-specific question and a general-bank OS question appear in the same list, distinguishable only by their category badge. Deloitte's HR round shows this best — `general_hr`, `company_specific`, `cn` and `dbms` side by side.

## Known limitations / things deferred

- **Read-only, by design.** No answering, no submissions, no progress tracking. Phase 4.
- **No test-case display for coding questions.** The DSA question shows a "Coding" badge but nothing else distinguishes it. Test cases are Phase 6.
- **No search, filter, sort or pagination.** With two companies and 13 questions this is not yet a problem. It will be after Phase 5 bulk-loads the general bank — question lists per round should stay small, but a global question browser would need it.
- **404s render as a plain error string.** Visiting `/companies/<bad-id>` shows "Company not found" as red text rather than a designed not-found page.
- **No caching.** Navigating back to a page refetches. Correct but chatty; a cache layer would be premature now.
- **Each page fetches on mount, so there is a brief "Loading…" flash** even on fast local responses. Acceptable; would matter more over a real network.
- **The Phase 0 health-check display is gone**, since the dashboard it lived on was replaced. `/health/full` still exists and `api.healthFull()` is still in the client — only the UI that displayed it was removed.
- **Round `notes` are shown as plain text.** Fine for the seeded values; long notes have no truncation.
- **CORS still wide open**, carried from Phase 0. Unchanged, still needs restricting before deployment.
- **No automated tests.** Verified by hand as below.

## How to verify it works

Prerequisites: database running, backend and frontend dev servers running. Log in as `student@test.com` / `password123`, or your own account.

### Browser flow — the main check

1. **Open http://localhost:5173.** Logged in, you land on **Companies** — two tiles, Deloitte and TCS, each showing "1 role".
2. **Click TCS** → Systems Engineer, "4 rounds".
3. **Click Systems Engineer** → four rounds, numbered **1 Aptitude Test, 2 Technical Interview, 3 Coding Round, 4 HR Interview**, each with a type badge, note and question count. The numbering is the point: order is explicit, not incidental.
4. **Click Technical Interview** → five questions with category badges (OS ×2, Networks, DBMS, DSA).
5. **Use the breadcrumbs** at the top to walk back: `Companies › TCS › Systems Engineer`. Each is clickable except the current page.
6. **Now the contrast — go back to Companies and click Deloitte** → Business Analyst → **only 2 rounds**, starting with Group Discussion, **no coding round**. This is the whole reason Phase 1 seeded mismatched shapes: the same UI renders both without special-casing.
7. **Click Deloitte's HR Interview** → four questions mixing **Company specific**, **General HR**, **Networks** and **DBMS**. Company-specific and general-bank questions sitting together is exactly what the `RoundQuestion` join table exists for.

### Confirm the answer key is not exposed

With the round page open, press `F12` → Network tab → refresh → click the `rounds/...` request → Response. The question objects should contain `id`, `text`, `category`, `difficulty` and `questionType` — and **no `expectedAnswerPoints`**. If that field ever appears here, the answer key is reaching the browser.

### Confirm the routes are protected

```
curl -i http://localhost:4000/catalog/companies
```

Expect `HTTP/1.1 401`. `-i` prints the status line. Every catalogue route behaves the same way without a token — the data is not public.

### Confirm ordering is not accidental

```
docker exec -i mock-interview-db-1 psql -U mockinterview -d mockinterview -c "SELECT round_name, order_index FROM round ORDER BY random();"
```

`ORDER BY random()` deliberately scrambles the rows. The API still returns them 1, 2, 3, 4 because it sorts explicitly — proving the UI ordering does not depend on how the database happens to return rows.

## What I verified myself

Walked the entire tree over the API for both companies: Deloitte → Business Analyst → 2 rounds (group_discussion, hr) and TCS → Systems Engineer → 4 rounds (aptitude, technical, coding, hr), with every round's questions fetched. Confirmed rounds come back in `order` sequence; Deloitte's HR round returns `general_hr, company_specific, cn, dbms` together; **no question object in any round contained `expectedAnswerPoints`** (asserted programmatically across all 6 rounds); `/catalog/companies` returns 401 without a token; a non-existent company id returns 404. Backend and frontend both compile, and frontend lint is clean with no suppressions.

**Not verified by me:** the rendered pages, clicking, and breadcrumb navigation. No browser automation is available here, so the UI itself was unexercised on my side — steps 1–7 above needed the user's eyes. **The user confirmed the full browse flow in the browser on 2026-08-03**, including the acceptance criterion: TCS's four-round structure and Deloitte's two-round structure both rendering correctly from the same components.

---

## In plain English

This is the first phase you can actually *use*. It turns the data from Phase 1 into pages you click through: companies → roles → rounds → questions, with breadcrumbs to walk back up. There's still no answering — this is pure looking.

The interesting part isn't the pages, it's what happens when you compare TCS and Deloitte. TCS has four rounds ending in a coding round; Deloitte has two and starts with a group discussion. **The same code renders both**, with no special cases anywhere — the UI just asks "what rounds does this role have?" and draws however many come back. That's the payoff for the schema work in Phase 1, and it's why the seed data was deliberately made lopsided. If both companies had four rounds, this would look like it worked while hiding an assumption that would break on the first company that didn't fit.

The other thing worth understanding is a decision your brief didn't specify. Each question in the database carries `expectedAnswerPoints` — the checklist of what a good answer contains. I **removed it from the API entirely**, not just from the screen. A student who opens browser devtools on a practice question shouldn't be able to read the model answer; hiding it in the UI alone would be theatre, since the data would still be sitting in the network response. So the server never sends it, which means the UI can't leak it even by accident. Phase 4 will use those points server-side to grade your answer, where you never see the raw list.

Two smaller choices with real reasons behind them. Every response carries its **parent chain** — asking for a round tells you its role and company too — so breadcrumbs render from one request instead of three chained ones, each with its own loading spinner. And rounds are sorted **explicitly** by their order number, because databases give no ordering guarantee unless you ask; skipping that often looks fine in development and then scrambles itself later for no visible reason.
