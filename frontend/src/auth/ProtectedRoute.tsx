import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./useAuth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Must wait for the token check, or a refresh on a protected page would
  // bounce the user to login before /me has had a chance to answer.
  if (loading) return <p className="centered">Loading…</p>;

  // `replace` keeps the protected URL out of history, so Back after logging in
  // does not return to a page the user can no longer see. `state` remembers
  // where they were headed so login can send them back there.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
}
