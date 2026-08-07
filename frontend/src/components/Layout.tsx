import { Link } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { useAuth } from "../auth/useAuth";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  // Logging out now makes a network call to revoke the token, so the button is
  // disabled while it is in flight — otherwise a double click fires two
  // revocations, the second of which arrives with an already-dead token.
  const [signingOut, setSigningOut] = useState(false);

  async function onLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          Mock Interview Prep
        </Link>
        <div className="topbar-right">
          <Link to="/progress" className="nav-link">
            Progress
          </Link>
          <span className="muted small">{user?.name ?? user?.email}</span>
          <button className="link-button" onClick={onLogout} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Log out"}
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
