import "dotenv/config";
import cors from "cors";
import express from "express";

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

app.listen(PORT, () => {
  console.log(`backend listening on http://localhost:${PORT}`);
});
