import { Link, NavLink } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { api } from "../api";
import { useAuth } from "../auth/useAuth";
import { useFetch } from "../useFetch";
import { AppMark } from "./AppMark";
import { CompanyMark } from "./CompanyMark";

/**
 * The app shell: a persistent rail beside the content.
 *
 * The rail replaced a top bar because this product is organised around
 * companies, and a top bar had nowhere to say so — every screen looked the same
 * regardless of which company you were working towards. Keeping the company
 * strip permanently on screen is what makes the app read as being *about*
 * employers rather than being a generic list of questions.
 *
 * It collapses to a horizontal bar under 900px; a fixed rail would eat a third
 * of a phone screen.
 */
export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  // Logging out makes a network call to revoke the token, so the button is
  // disabled while it is in flight — otherwise a double click fires two
  // revocations, the second of which arrives with an already-dead token.
  const [signingOut, setSigningOut] = useState(false);

  // The rail's company strip. Deliberately failure-tolerant: if this request
  // errors the strip simply does not render, because chrome must never be the
  // reason a page the user asked for fails to appear.
  const { data } = useFetch(api.companies, "companies");
  const companies = data?.companies ?? [];

  async function onLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="shell">
      <aside className="rail">
        <Link to="/" className="brand">
          <AppMark />
          <span className="brand-text">
            Mock Interview <em>Prep</em>
          </span>
        </Link>

        <nav className="rail-nav">
          {/* `end` so the companies link is not left active on every nested
              catalogue route, which all begin with "/". */}
          <NavLink to="/" end className="rail-link">
            Companies
          </NavLink>
          <NavLink to="/progress" className="rail-link">
            Progress
          </NavLink>
        </nav>

        {companies.length > 0 && (
          <div className="rail-section">
            <p className="rail-label">Jump to</p>
            <ul className="rail-companies">
              {companies.map((c) => (
                <li key={c.id}>
                  <Link to={`/companies/${c.id}`} title={c.name}>
                    <CompanyMark name={c.name} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rail-foot">
          <span className="rail-user">{user?.name ?? user?.email}</span>
          <button className="link-button" onClick={onLogout} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Log out"}
          </button>
        </div>
      </aside>

      <main className="page">{children}</main>
    </div>
  );
}
