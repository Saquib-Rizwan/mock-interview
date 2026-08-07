# Security Hardening

Status: **built and verified.** Not part of the original brief — this came out of the stated target of 1000–5000 public users, at which point several things that were fine for a local demo stop being fine.

Done between Phase 6 and Phase 7, deliberately before any polish work, on the grounds that these were the only items on the outstanding list that were *wrong* rather than merely *missing*.

## What was implemented

| Area | Change |
|---|---|
| CORS | `cors()` → an origin allowlist read from `CORS_ORIGIN` |
| Token revocation | `User.tokenVersion`, checked on every authenticated request; `POST /auth/logout` increments it |
| Rate limiting | Three separate limiters on auth, code execution and LLM routes |
| Request size | `express.json({ limit: "1mb" })` |
| Proxy awareness | `app.set("trust proxy", 1)` so IP-keyed limits see the caller, not the load balancer |

Files: `src/rateLimits.ts` (new), `src/auth/jwt.ts`, `src/auth/middleware.ts`, `src/auth/routes.ts`, `src/index.ts`, `frontend/src/auth/AuthContext.tsx`, `frontend/src/components/Layout.tsx`, `.env.example`.

Migration: `20260807112403_add_token_version`.

**New dependency: `express-rate-limit`** — the de facto standard for Express, no transitive baggage.

## Why this approach

**CORS: an allowlist, and a silent one.** A bare `cors()` reflects whatever origin asks, so any website a signed-in student visited could call this API from their browser. Tokens live in localStorage rather than cookies, so this was not classic CSRF — but it removed the browser's last objection to a hostile page scripting the API with a stolen token.

Disallowed origins get `callback(null, false)`, not an `Error`. That omits the `Access-Control-Allow-Origin` header, which is precisely what makes the browser refuse to hand the response to the calling page. Passing an `Error` would surface as a 500 through the error handler — misleading in logs, and no more secure, because CORS is enforced browser-side either way.

**Revocation by token version, not a revocation table.** The choice was flagged before implementing. A per-token denylist would allow signing out one device while leaving others in, but needs its own table *and* a job to prune expired rows or it grows forever. A single integer on `User` gives complete revocation for one column and no maintenance. The trade-off — logging out on your phone signs out your laptop — is the right default for a study tool.

**The cost is honest and worth naming: auth is now stateful.** Checking the version means one indexed primary-key lookup per authenticated request, which is exactly the property JWTs are usually chosen to avoid. That trade is deliberate: revocation that cannot actually revoke is theatre, and without it a leaked token stayed usable for its full seven days with no way to stop it. Nearly every authenticated route touches the database anyway.

**Tokens without a `tv` claim are rejected, not defaulted.** Tokens issued before this change have no version. Treating a missing claim as `0` would have let pre-existing tokens survive a change whose whole point is being able to invalidate tokens. Rejecting them means deploying this signs everyone out once — the conservative behaviour, and the correct one.

**Three rate limits, not one.** The resources fail differently. Password guessing costs the server nothing but costs the user their account. A code submission costs real CPU on a two-core box that compiles C++ from cold. An LLM call costs quota that simply runs out and stays out. One global limit would have to be set for the worst case and would then be useless for the others.

`skipSuccessfulRequests` on the auth limiter means someone who keeps typing their password *correctly* is never locked out — only repeated failures count, which is what brute-forcing looks like.

**Logout fails open on the client.** If the revocation call fails, the frontend still clears local state. A network error must never trap someone in a signed-in state; server-side revocation is the belt, clearing local storage is the braces, and the braces always go on.

## How it works

```
request with Bearer token
        │
        ▼
  verify signature ────► invalid/expired ──► 401
        │
        ▼
  payload has userId + tv?  ──► no ──► 401   (pre-revocation token)
        │
        ▼
  SELECT token_version WHERE id = userId
        │
        ▼
  stored version == tv?  ──► no ──► 401      (revoked by logout)
        │
        ▼
  req.userId set, continue
```

`POST /auth/logout` increments the stored version. Every token carrying the old one fails the comparison from that moment.

## Known limitations / things deferred

- **Rate limit counters are per-process.** `express-rate-limit` defaults to an in-memory store, so running two backend instances behind a load balancer gives each its own counters and effectively doubles every limit. Fixing it needs a shared store such as Redis. Deferred deliberately: the current deployment is a single instance, and adding Redis for this alone is not yet justified.
- **Logout signs out every device.** By design, per the trade-off above — but it will surprise a user who is signed in on a phone and a laptop.
- **No account lockout or CAPTCHA.** The auth limiter is per-IP, so a distributed attempt from many addresses is not slowed. Real protection at scale needs per-account throttling as well.
- **No password reset flow.** A forgotten password currently means a database edit. This is a functional gap, not a security one, but it is the first thing real users will ask for.
- **No email verification.** Anyone can sign up as any address.
- **`trust proxy` is set to 1.** Correct behind exactly one proxy. Behind two, `req.ip` would be the first proxy's address and IP-keyed limits would lump users together. Needs revisiting at deploy time against the actual topology.
- **Rate limits are not tuned against real traffic.** The numbers are reasoned guesses. They should be watched after launch — too tight is a support burden, too loose defeats the point.
- **The hidden-test-case answer key is still committed** to the repository, as noted in the Phase 6 doc. Unchanged by this work.

## How to verify it works

Backend running, database up.

### 1. Revocation

```bash
# sign up and keep the token
TOKEN=$(curl -s -X POST localhost:4000/auth/signup -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"atleast8chars"}' | jq -r .token)

curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/auth/me -H "Authorization: Bearer $TOKEN"
# 200

curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:4000/auth/logout -H "Authorization: Bearer $TOKEN"
# 204

curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/auth/me -H "Authorization: Bearer $TOKEN"
# 401  <- the same token, now dead
```

That third result is the whole point: before this change it returned 200 for seven days.

### 2. CORS

```bash
curl -s -D - -o /dev/null -H "Origin: http://localhost:5173" localhost:4000/health | grep -i access-control-allow-origin
# Access-Control-Allow-Origin: http://localhost:5173

curl -s -D - -o /dev/null -H "Origin: https://evil.example.com" localhost:4000/health | grep -i access-control-allow-origin
# (nothing) — no header, so a browser refuses to hand the response to that page
```

### 3. Rate limiting

Eleven failed logins in a row: the first ten return 401, the eleventh returns 429.

**Note:** the limiter is in-memory, so restarting the backend clears all counters. That is also how you unlock yourself if you trip it during testing.

### 4. In the browser

Log in, then click **Log out**. The button should read "Signing out…" briefly. Then check the browser devtools Network tab shows a `POST /auth/logout` returning 204, and that reloading the page lands you on the login screen rather than restoring the session.

## What I verified myself

Backend typechecks; frontend lints and builds.

**Revocation**, end to end against the running server: signed up, confirmed the token's payload carries `tv: 0`, called `/auth/me` successfully (200), logged out (204), then called `/auth/me` with the *same* token and got 401.

**CORS**: `http://localhost:5173` gets `Access-Control-Allow-Origin` echoed back; `https://evil.example.com` gets no such header.

**Rate limiting**: twelve consecutive failed logins — attempts 1–10 returned 401, attempts 11 and 12 returned 429.

The temporary test account was deleted afterwards.

**Not verified by me:** the browser logout flow as rendered, the code-execution and LLM limiters (both would need 30 and 20 real submissions respectively to trip), and behaviour behind an actual reverse proxy.

---

## In plain English

This is the unglamorous work that separates "runs on my laptop" from "safe to put on the internet". Nothing here adds a feature; all of it closes a hole.

The biggest one was logging out. Until now, "log out" only deleted the token from your own browser — the token itself stayed valid for a week. If someone had copied it, clicking log out did nothing to stop them. Now the server keeps a version number against your account, every token carries the version it was made with, and logging out bumps the number. Every token issued before that instant stops working immediately. The cost is that the server has to check that number on every request, which makes logins slightly less "free" than they were, and that's a trade worth making — a log-out button that doesn't actually log you out is worse than not having one.

The second was that the API accepted requests from any website in the world. If you were signed in here and then visited some other page, that page's code could have called this API as you. Now the API only talks to addresses on a list, and that list lives in configuration so it can point at the real site when you deploy.

The third was that nothing stopped anyone doing something a thousand times. Guessing passwords, running code, asking the AI to grade answers — all unlimited. There are now three separate limits, because those three things break in different ways: guessing passwords threatens accounts, running code eats the two CPU cores on the execution machine, and asking the AI costs money that runs out. One shared limit would have to be set for the worst case and would be wrong for the other two.

None of this is visible to a student using the site, which is the point. The one thing they will notice is that logging out on their phone also signs them out on their laptop — a deliberate choice, and the safer default for a tool that holds your practice history.
