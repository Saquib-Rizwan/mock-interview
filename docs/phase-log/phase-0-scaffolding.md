# Phase 0 — Project Scaffolding

Status: **complete and verified** (confirmed working end to end, 2026-08-02).

## What was implemented

**Monorepo root**
- `package.json` — npm workspaces root (`backend`, `frontend`), convenience scripts `dev:backend` / `dev:frontend`.
- `.gitignore` — node_modules, dist, `.env`, Python venv/pycache.
- `docker-compose.yml` — PostgreSQL 16 container for local dev.
- Repo initialised with `git init`. No commits made yet.

**`/backend`** — Node + TypeScript + Express
- `src/index.ts` — Express server. Two endpoints:
  - `GET /health` → `{"status":"ok","service":"backend"}`
  - `GET /health/full` → calls ml-service's `/health` and reports both statuses. This is the endpoint that proves the whole chain.
- `tsconfig.json` — strict mode, CommonJS, compiles `src` → `dist`.
- `.env.example` / `.env` — `PORT`, `ML_SERVICE_URL`, `DATABASE_URL`.
- Prisma initialised: `prisma/schema.prisma` (datasource only, **no models yet** — models are Phase 1), `prisma.config.ts`.

**`/ml-service`** — Python + FastAPI
- `app/main.py` — `GET /health` → `{"status":"ok","service":"ml-service"}`.
- `requirements.txt` — fastapi, uvicorn. Installed into a local `venv/`.

**`/frontend`** — React + Vite + TypeScript
- `src/App.tsx` — replaces the Vite starter page. On mount it fetches `GET {BACKEND_URL}/health/full` and renders the backend + ml-service statuses, with explicit loading and error states.
- `.env.example` — `VITE_BACKEND_URL`.

**`/docs/phase-log`** — this file.

## Why this approach

**npm workspaces instead of Turborepo/pnpm/Nx.** Three packages, only two of which are Node. Workspaces ship with the already-installed npm 10 and need zero extra dependencies. A build orchestrator would be dead weight at this size; it can be added later if build times ever justify it.

**Express over Fastify.** Your call. Noted here because it constrains later phases: auth middleware in Phase 2 will use the Express middleware idiom.

**Prisma 6, not 7.** Prisma 7 released recently and the CLI actively suggests upgrading. I pinned to `^6.19` because 7 is a major version with migration steps, and the parts of 7 that matter most (the `prisma-client` generator, `prisma.config.ts`) are already what 6.19 generates by default. Not a permanent decision — worth revisiting before the schema gets large, i.e. early in Phase 1 rather than later.

**A separate `/health/full` endpoint rather than making `/health` do the chain check.** `/health` should answer "is this process alive" without depending on anything downstream — otherwise a dead ml-service would make the backend look dead to a load balancer. `/health/full` is the deliberate dependency check.

**Non-default ports (see limitations).** Two containers from another project on this machine (`draft-to-glory-postgres`, `drafttoglory-ml-service`) already hold 5432 and 8000. Rather than stop them, this project uses **Postgres on 5433** and **ml-service on 8001**. This is the one piece of the setup that will surprise someone picking it up cold.

**`.env` committed as `.env.example` only.** Real `.env` is gitignored. The example holds dev-only credentials so a fresh clone can `cp .env.example .env` and go.

## How it works

Three processes plus a database:

```
browser (localhost:5173)
   │  fetch /health/full
   ▼
backend  (localhost:4000, Express)
   │  fetch /health
   ▼
ml-service (localhost:8001, FastAPI)

backend ──Prisma──► Postgres (localhost:5433, Docker container mock-interview-db-1)
```

The frontend reads `VITE_BACKEND_URL` (default `http://localhost:4000`) at build time. The backend reads `ML_SERVICE_URL` (default `http://localhost:8001`) from `.env` at runtime. The backend uses Node 22's built-in `fetch`, so there is no HTTP-client dependency.

`/health/full` wraps its downstream call in try/catch and reports `unreachable` with the error message rather than throwing — so the frontend can distinguish "backend is down" (fetch fails entirely) from "backend is up, ml-service is down" (200 response, `mlService.status: "unreachable"`).

Postgres runs in Docker with a named volume `mock-interview_pgdata`, so data survives `docker compose down` — it is only destroyed by `docker compose down -v`.

## Known limitations / deferred

- **No Prisma models.** `schema.prisma` declares the datasource and generator only. All models land in Phase 1.
- **Backend does not connect to Postgres at runtime.** Prisma's connection is verified via CLI, but no `PrismaClient` is instantiated in `src/index.ts` yet — nothing needs the DB until Phase 1.
- ~~**Frontend not visually verified by me.**~~ **Resolved.** No browser automation was available in this environment, so I verified only that TypeScript compiles, `vite build` succeeds, the dev server serves HTML, and the backend endpoint returns correct JSON with permissive CORS headers. The user confirmed in a browser that the page renders `Backend: ok` / `ML service: ok`, closing the browser→backend hop.
- **CORS is wide open** (`cors()` with no options, `Access-Control-Allow-Origin: *`). Fine for local dev, must be restricted to a known origin before any deployment.
- **No auth, no business logic, no tests.** Phase 0 is deliberately a walking skeleton.
- **No process manager.** Each service is started in its own terminal by hand. If juggling three terminals gets annoying, `concurrently` or adding backend/ml-service to docker-compose are the options — deferred, not needed yet.
- **ml-service `/health` is static.** It returns `ok` unconditionally; it doesn't check LLM connectivity because there's no LLM integration until Phase 4.
- **Port deviation from convention** (5433/8001) as described above.

## How to verify it works

Four terminals. Run from the repo root, `d:\mock-interview`.

**1. Start the database**
```
docker compose up -d
```
`up` creates and starts the container; `-d` detaches so it runs in the background. Expect `Container mock-interview-db-1 Started`.

Confirm it's actually accepting connections (a container can be "up" before Postgres has finished booting):
```
docker exec mock-interview-db-1 pg_isready -U mockinterview -d mockinterview
```
Expect `/var/run/postgresql:5432 - accepting connections`. The `5432` here is the port *inside* the container — from your machine it's reachable on 5433. If you instead see `no response`, give it a few seconds and retry.

**2. Start the ml-service**
```
cd ml-service
venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```
`uvicorn` is the ASGI server that runs FastAPI. `app.main:app` means "the object named `app` inside `app/main.py`". `--reload` restarts on file changes. Expect `Uvicorn running on http://127.0.0.1:8001`.

If you see `Address already in use`, something else grabbed 8001 — find it with `netstat -ano | findstr :8001`.

**3. Start the backend**
```
npm run dev --workspace backend
```
Runs `tsx watch src/index.ts` — `tsx` runs TypeScript directly without a separate compile step, `watch` restarts on change. Expect `backend listening on http://localhost:4000`.

**4. Start the frontend**
```
npm run dev --workspace frontend
```
Expect `Local: http://localhost:5173/`.

**5. Check the chain**

Command line:
```
curl http://localhost:4000/health/full
```
Expect exactly:
```json
{"backend":"ok","mlService":{"status":"ok"}}
```

If ml-service is stopped you'd instead get `{"backend":"ok","mlService":{"status":"unreachable","error":"fetch failed"}}` — which is the intended behaviour, not a bug.

**Then open http://localhost:5173 in a browser.** This is the part I could not verify myself. You should see the heading "Mock Interview Prep — Phase 0" and a two-item list reading `Backend: ok` and `ML service: ok`. If you see "Error reaching backend", the backend isn't running or isn't on 4000 — check the terminal from step 3 and the browser devtools console.

**6. Check Prisma reaches the database**
```
cd backend
echo "SELECT 1;" | npx prisma db execute --stdin --schema prisma/schema.prisma
```
This opens a connection using `DATABASE_URL` from `.env` and runs a trivial query. Expect `Script executed successfully.` A failure here means the connection string is wrong or the container isn't up — the error will name which.

## Decision carried into Phase 1

**Prisma stays on 6.x.** Considered upgrading to 7 before defining models (cheaper before migrations exist than after), decided against it: 6.19 already generates the Prisma 7 patterns that matter (`prisma-client` generator, `prisma.config.ts`), and 6.x has far better documentation coverage — which matters more than being current while learning the tool. The CLI's upgrade nag can be ignored. Revisit only if a needed feature is 7-only.

---

## In plain English

This phase built **nothing that a user can see** — and that was the point. The goal was a "walking skeleton": four pieces of software that each do almost nothing, but which can prove they're able to talk to each other. Getting three languages (TypeScript, Python, SQL) and four processes to cooperate is the part that usually goes wrong, and it's much cheaper to find that out now than after you've written real features on top.

The four pieces are a **React frontend** (the pages you see, port 5173), a **Node/Express backend** (the brain that decides everything, port 4000), a **Python FastAPI service** (which will call the LLM later, port 8001), and **PostgreSQL** running inside Docker (the database, port 5433). The rule that shapes everything afterwards is that the frontend never talks to the database or the Python service directly — it only ever asks the backend, and the backend goes and gets whatever is needed. That keeps one place responsible for security and business rules.

The trick used to prove it all works is the `/health/full` endpoint. Anyone can write four programs that each claim "I'm alive" in isolation; that proves nothing about whether they can reach each other. So `/health/full` makes the backend actually call the Python service and report back what it heard. When the browser shows `Backend: ok, ML service: ok`, three separate network hops just succeeded in sequence. Everything after this phase is built on that foundation being solid.
