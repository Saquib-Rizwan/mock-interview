import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/useAuth";

export function Dashboard() {
  const { user, logout } = useAuth();
  const [health, setHealth] = useState<string>("checking…");

  // Carried over from Phase 0 so the stack check stays visible after login.
  useEffect(() => {
    api
      .healthFull()
      .then((h) => setHealth(`backend ${h.backend}, ml-service ${h.mlService.status}`))
      .catch(() => setHealth("unreachable"));
  }, []);

  return (
    <div className="card">
      <h1>Dashboard</h1>
      <p>
        Logged in as <strong>{user?.name ?? user?.email}</strong>
      </p>

      <dl className="details">
        <dt>Email</dt>
        <dd>{user?.email}</dd>
        <dt>User ID</dt>
        <dd className="mono">{user?.id}</dd>
        <dt>Joined</dt>
        <dd>{user && new Date(user.createdAt).toLocaleString()}</dd>
        <dt>Services</dt>
        <dd>{health}</dd>
      </dl>

      <p className="muted small">
        This page is protected — the details above come from <code>/auth/me</code>,
        which rejects requests without a valid token.
      </p>

      <button onClick={logout}>Log out</button>
    </div>
  );
}
