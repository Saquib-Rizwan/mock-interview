import { useEffect, useState } from "react";
import "./App.css";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000";

type HealthFull = {
  backend: string;
  mlService: { status: string; error?: string };
};

function App() {
  const [health, setHealth] = useState<HealthFull | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/health/full`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<HealthFull>;
      })
      .then(setHealth)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Mock Interview Prep — Phase 0</h1>
      <p>This page calls the backend, which in turn calls the ml-service.</p>
      {error && <p style={{ color: "crimson" }}>Error reaching backend: {error}</p>}
      {!error && !health && <p>Loading...</p>}
      {health && (
        <ul>
          <li>Backend: {health.backend}</li>
          <li>
            ML service: {health.mlService.status}
            {health.mlService.error ? ` (${health.mlService.error})` : ""}
          </li>
        </ul>
      )}
    </main>
  );
}

export default App;
