import "dotenv/config";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { assessmentsRouter, attemptsRouter } from "./assessments/routes";
import { authRouter } from "./auth/routes";
import { catalogRouter } from "./catalog/routes";
import { codingRouter } from "./coding/routes";
import { judge0Health } from "./judge0/client";
import { progressRouter } from "./progress/routes";
import { submissionsRouter } from "./submissions/routes";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

/**
 * Origins allowed to call this API, comma-separated in CORS_ORIGIN.
 *
 * Previously this was a bare `cors()`, which reflects any origin — meaning any
 * website a logged-in student visited could call this API and read their data.
 * Tokens live in localStorage rather than cookies, so it was not classic CSRF,
 * but it removed the browser's last objection to a hostile page scripting the
 * API on the user's behalf.
 */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header at all means a non-browser client — curl, the health
      // checks, a mobile app. Those are not what CORS protects against, and
      // rejecting them would break every command-line call.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

      // Disallowed origins get `false`, not an error: that omits the
      // Access-Control-Allow-Origin header, which is exactly what makes the
      // browser refuse to hand the response to the calling page. Passing an
      // Error instead would surface as a 500 through the error handler —
      // misleading in logs, and no more secure, since CORS is enforced by the
      // browser either way.
      return callback(null, false);
    },
  })
);

// Trust the first proxy hop so req.ip is the caller's address rather than the
// load balancer's. Without this, IP-keyed rate limiting behind a proxy would
// treat every user as the same client.
app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "backend" });
});

// Proves the full chain: frontend -> backend -> ml-service -> judge0.
app.get("/health/full", async (_req, res) => {
  const result: {
    backend: string;
    mlService: { status: string; error?: string };
    judge0: { status: string; error?: string };
  } = {
    backend: "ok",
    mlService: { status: "unreachable" },
    judge0: await judge0Health(),
  };

  try {
    const response = await fetch(`${ML_SERVICE_URL}/health`);
    if (!response.ok) {
      result.mlService = { status: "error", error: `HTTP ${response.status}` };
    } else {
      const data = (await response.json()) as { status?: string };
      result.mlService = { status: data.status ?? "unknown" };
    }
  } catch (err) {
    result.mlService = {
      status: "unreachable",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  res.json(result);
});

app.use("/auth", authRouter);
app.use("/catalog", catalogRouter);
app.use("/submissions", submissionsRouter);
app.use("/coding", codingRouter);
app.use("/progress", progressRouter);
app.use("/assessments", assessmentsRouter);
app.use("/attempts", attemptsRouter);

// Last-resort handler. Async routes reach it via the asyncHandler wrapper,
// which forwards promise rejections to next(). Errors are logged in full but
// never returned to the client, since stack traces leak internals.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`backend listening on http://localhost:${PORT}`);
});
