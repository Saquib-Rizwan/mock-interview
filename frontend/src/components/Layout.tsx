import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/useAuth";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          Mock Interview Prep
        </Link>
        <div className="topbar-right">
          <span className="muted small">{user?.name ?? user?.email}</span>
          <button className="link-button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
