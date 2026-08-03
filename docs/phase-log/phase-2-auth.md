# Phase 2 — Auth

Status: ready for review.

## What was implemented

**Schema**
- `User` model — `id`, `email` (unique), `passwordHash`, `name` (optional), `createdAt`. Migration `20260802170127_add_user_auth`.

**Backend**
- `src/prisma.ts` — single shared `PrismaClient`.
- `src/asyncHandler.ts` — wrapper forwarding async route rejections to Express's error handler.
- `src/auth/jwt.ts` — token signing/verification; throws at startup if `JWT_SECRET` is missing.
- `src/auth/middleware.ts` — `requireAuth`, attaches `req.userId`.
- `src/auth/routes.ts` — `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`.
- `src/index.ts` — mounts `/auth`, adds a JSON error handler.
- `.env` / `.env.example` — added `JWT_SECRET`, `JWT_EXPIRES_IN`.

**Frontend**
- `src/api.ts` — fetch wrapper that attaches the bearer token and throws `ApiError` on non-2xx.
- `src/auth/context.ts`, `AuthContext.tsx`, `useAuth.ts` — auth state split across three files (see below).
- `src/auth/ProtectedRoute.tsx` — redirects to `/login`, remembering the intended destination.
- `src/pages/Login.tsx`, `Signup.tsx`, `Dashboard.tsx`.
- `src/App.tsx` — routes; `src/main.tsx` — `BrowserRouter` + `AuthProvider`.
- `index.css` / `App.css` — replaced the Vite starter styles (dead once the demo page went).

**New dependencies:** `bcryptjs`, `jsonwebtoken`, `@types/jsonwebtoken` (backend); `react-router-dom` (frontend). Rationale below.

## Why this approach

**`bcryptjs` over `bcrypt`.** The native `bcrypt` needs a C++ compile step that commonly fails on Windows without Visual Studio build tools. `bcryptjs` is pure JavaScript — a few times slower, which is irrelevant at one hash per login, and it removes a whole class of "works on my machine" setup failure.

**Cost factor 12** — roughly 250 ms per hash. Slow enough that offline brute-forcing a stolen database is expensive, fast enough that login feels instant. The cost is stored inside the hash string, so it can be raised later without invalidating existing passwords.

**`react-router-dom`.** The app had no router at all. This phase needs three URLs and redirect-on-unauthenticated. Hand-rolling that is more code and more bugs than the standard library for it.

**JWT in localStorage** (your call) — token sent as `Authorization: Bearer <token>`. Simplest thing that works across the separate frontend (5173) and backend (4000) origins. The XSS trade-off is recorded under limitations.

**Table mapped to `app_user`, not `user`.** `USER` is a reserved word in PostgreSQL. `SELECT * FROM user` does not error — it silently resolves to the *current database user*, returning one wrong row. Renaming avoids a genuinely confusing debugging session. Same reasoning as `order_index` in Phase 1.

**Uniform failure messages on login.** Wrong password and unknown email both return `401 Invalid email or password`. Distinct messages would let anyone enumerate which addresses have accounts. Signup necessarily leaks this (it must reject duplicates), which is the standard trade-off.

**Login hashes even when the user does not exist.** Returning early on unknown email would make those responses measurably faster, leaking the same information through timing that the uniform message hides. A dummy `bcrypt.compare` keeps both paths similarly slow.

**Duplicate signup relies on the database constraint, not a pre-check.** Checking "does this email exist?" then inserting has a race: two simultaneous signups can both see the address as free. Catching Prisma's `P2002` unique-violation is atomic.

**Auth state split across three files.** `context.ts` holds the context object, `AuthContext.tsx` the provider component, `useAuth.ts` the hook. Vite's fast refresh only works when a file exports components exclusively — combining them produced a lint warning and unreliable hot reload.

**`asyncHandler` wrapper.** Express 4 does not catch rejected promises from `async` route handlers: the error never reaches the error middleware and the request hangs until it times out. The wrapper forwards rejections to `next()`. Express 5 does this natively, so this becomes deletable on upgrade.

**`AuthProvider` verifies the stored token against `/me` on load** rather than trusting it. A token in localStorage is only a claim — it may be expired, or the account may have been deleted. The `loading` flag exists so a page refresh does not flash the login screen before that check returns.

## How it works

**Signup:** validate → bcrypt-hash the password → insert → sign a JWT containing `{ userId }` → return token + user.

**Login:** look up by lowercased email → `bcrypt.compare` → sign a JWT → return token + user.

**Authenticated request:** frontend reads the token from localStorage and sends `Authorization: Bearer <token>`. `requireAuth` verifies the signature and expiry, sets `req.userId`, and the route loads the user from that.

The JWT is signed, not encrypted — anyone can read its contents. It carries only a user ID and expiry, no secrets. What it guarantees is *authenticity*: without `JWT_SECRET` nobody can forge or alter one, because the signature would stop matching.

**Frontend routing:**

| Path | Guard | Behaviour |
|---|---|---|
| `/login`, `/signup` | `PublicOnly` | Redirects to `/` if already logged in |
| `/` | `ProtectedRoute` | Redirects to `/login` if not |
| anything else | — | Redirects to `/` |

`ProtectedRoute` passes the attempted path in navigation state, so logging in returns you where you were headed rather than always to the dashboard.

Emails are lowercased before storage and lookup, so `Foo@x.com` and `foo@x.com` are one account.

## Known limitations / things deferred

- **XSS can steal the token.** This is the accepted cost of localStorage. Any injected script can read it and impersonate the user until it expires. Mitigation would be httpOnly cookies plus CSRF protection — considered and deliberately not taken this phase.
- **Logout is client-side only.** JWTs are stateless: the server has no record of issued tokens, so a token already copied elsewhere keeps working until it expires (7 days). Real revocation needs a server-side denylist or short-lived tokens plus refresh tokens. Neither is in this phase's brief.
- **No rate limiting.** Login accepts unlimited attempts. bcrypt cost 12 makes this slow rather than free, but it is not a substitute for rate limiting. Should be addressed before any deployment.
- **No password reset, no email verification.** Anyone can sign up with an address they do not own. Not in the brief; Phase 7 candidates.
- **No refresh tokens.** After 7 days the user is silently logged out on their next request.
- **Validation is hand-rolled** (~15 lines) rather than using a schema library. Fine for two endpoints; if Phase 4/5 add many more, `zod` is the obvious candidate — flagged rather than added speculatively.
- **The email regex is deliberately permissive.** It checks for `something@something.something`. Fully validating email syntax is famously impractical, and the only real proof an address works is sending mail to it.
- **No roles or admin flag.** Every user is an ordinary student. Phase 5 mentions admin-only ingestion, which is script-based, so this was not needed yet.
- **CORS is still wide open** (carried over from Phase 0). Must be restricted before deployment — more pressing now that real tokens are involved.
- **`react-router-dom` 7.18.2 shows a high-severity npm audit warning** (`GHSA-qwww-vcr4-c8h2`). The advisory covers **RSC mode** — React Server Components with server-side actions. This app is a plain client-side SPA using `BrowserRouter`, with no server rendering and no router actions, so the vulnerable code path is not present. There is no patched release above 7.18.2; npm's only "fix" is downgrading to 7.11.0, which would forgo seven minor releases of other fixes. Staying on latest, recorded here so the audit warning is not mistaken for an unexamined risk. Revisit when a patched version ships.
- **No automated tests.** Everything below was verified by hand.

## How to verify it works

Prerequisites: database running (`docker compose up -d`), backend and frontend dev servers running.

**A test account already exists** from my verification: `student@test.com` / `password123`.

### Browser flow — the main check

1. **Open http://localhost:5173** → you should be redirected to **/login**, because no token is stored. This is the "unauthenticated users get redirected" requirement.
2. **Go to /signup**, create an account (password ≥ 8 characters) → you land on the dashboard showing your email, user ID and join date.
3. **Refresh the page** → you stay logged in. This proves the token persisted in localStorage and was re-verified against `/auth/me`.
4. **Click Log out** → back to /login. Try navigating to http://localhost:5173/ directly → redirected to /login again.
5. **Log in** with the account you just made → back to the dashboard.
6. **Try signing up again with the same email** → "An account with that email already exists".
7. **Log in with a wrong password** → "Invalid email or password".

To see the stored token: browser devtools (`F12`) → Application → Local Storage → `http://localhost:5173` → key `mockinterview.token`. Deleting that key and refreshing logs you out — a good way to see that the token *is* the session.

### API checks

Protected route rejects unauthenticated requests:

```
curl -i http://localhost:4000/auth/me
```
Expect `HTTP/1.1 401` and `{"error":"Missing or malformed Authorization header"}`. `-i` prints response headers so you can see the status code.

Log in and use the token:

```
curl -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" -d "{\"email\":\"student@test.com\",\"password\":\"password123\"}"
```
Returns `{"token":"eyJ...","user":{...}}`. Copy the token value, then:

```
curl http://localhost:4000/auth/me -H "Authorization: Bearer PASTE_TOKEN_HERE"
```
Expect the user object. Change any single character of the token and retry → `401 Invalid or expired token`, which is the signature check working.

> On Windows `cmd`, JSON quotes inside `-d` must be escaped as `\"` as shown. In Git Bash you can use single quotes instead: `-d '{"email":"..."}'`.

### Confirm passwords are hashed

```
docker exec -i mock-interview-db-1 psql -U mockinterview -d mockinterview -c "SELECT email, left(password_hash, 30) AS hash, length(password_hash) AS len FROM app_user;"
```

Expect hashes starting `$2b$12$` and 60 characters long — `$2b$` is the bcrypt identifier, `12` the cost factor. **No plaintext password should appear anywhere.** If you see a readable password here, something is badly wrong.

## What I verified myself

Ran and confirmed via the API: `/auth/me` returns 401 without a token, 401 with a tampered token, and the user with a valid one; signup returns 201 with a token; duplicate signup returns 409; login succeeds with the right password and returns 401 with the wrong one; unknown email returns the *same* 401 message as a wrong password; `STUDENT@TEST.COM` logs in to the account created as `student@test.com`; passwords under 8 characters and malformed emails are rejected with 400; the stored value is a `$2b$12$` bcrypt hash, not plaintext. Backend and frontend both compile, frontend lint is clean, and `/`, `/login`, `/signup` all serve the SPA shell.

**Not verified by me:** the browser behaviour itself — form submission, localStorage persistence, and the redirect logic. There is no browser automation in this environment, so React rendering and client-side navigation are unexercised. The browser flow section above is exactly what needs your eyes; steps 1, 3 and 4 (redirect when logged out, survive refresh, redirect after logout) are the ones most likely to reveal a problem if one exists.

---

## In plain English

This phase added accounts: signing up, logging in, and making the server refuse to answer people who haven't done either. Two ideas do all the work.

The first is **password hashing**. The database never stores your password. It stores a bcrypt hash — a scrambled version that can't be reversed. When you log in, the server scrambles what you typed and checks whether it matches the stored scramble. This means that even someone who steals the entire database still doesn't have anyone's password. The "cost factor 12" setting deliberately makes each check take about a quarter of a second: unnoticeable when you log in once, but brutally slow for an attacker trying millions of guesses offline.

The second is the **JWT** — a token the server hands you when you log in, which your browser stores and sends back with every subsequent request. Think of it as a wristband at an event: the server checks it's genuine rather than re-checking your ID every time. The token isn't secret in the sense of being encrypted — anyone can read what's inside it (just a user ID and an expiry date, nothing sensitive). What makes it work is that it's *signed* with a secret key only the server knows, so nobody can forge one or alter theirs to claim a different user ID. Change a single character and the signature stops matching, which is exactly what I tested.

Two consequences are worth understanding because they're inherent to this design rather than shortcuts. **Logging out only clears the token from your browser** — the server keeps no list of issued tokens, so a token someone already copied keeps working until it expires in 7 days. And because the token lives in browser storage where JavaScript can read it, any XSS bug in the app could steal it. Both are the accepted trade-offs of the simpler approach we chose; the alternative (httpOnly cookies) is more secure but brings CSRF protection and a lot more moving parts. Also worth flagging: login has **no rate limiting** yet, so nothing stops unlimited password guesses — slow ones, thanks to bcrypt, but unlimited. That needs fixing before this ever goes online.
