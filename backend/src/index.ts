import "dotenv/config";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { authRouter } from "./auth/routes";
import { catalogRouter } from "./catalog/routes";
import { submissionsRouter } from "./submissions/routes";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "backend" });
});

// Proves the full chain: frontend -> backend -> ml-service.
app.get("/health/full", async (_req, res) => {
  const result: {
    backend: string;
    mlService: { status: string; error?: string };
  } = {
    backend: "ok",
    mlService: { status: "unreachable" },
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
