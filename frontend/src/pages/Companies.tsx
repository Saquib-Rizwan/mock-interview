import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type RoleEligibility } from "../api";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { CompanyMark } from "../components/CompanyMark";
import { useFetch } from "../useFetch";

/**
 * Working assumption for a role whose CGPA cutoff was never recorded.
 *
 * This is a FILTER-LAYER default and deliberately not stored: `minCgpa` stays
 * null in the database, so `catalog.json` never claims a cutoff its source did
 * not state. Changing this one number changes every unrecorded role at once,
 * and recording a real cutoff for a company overrides it automatically.
 *
 * Known weakness, worth remembering before trusting a filtered list: the
 * unrecorded set is mostly the large service companies, which in practice run
 * the LOWEST cutoffs of anyone here — often 6.0 to 6.5. Assuming 7.5 therefore
 * hides them from students in the 6.5-7.5 band, who are precisely the people
 * those companies hire. Lower this, or record the real figures, as they arrive.
 */
const ASSUMED_MIN_CGPA = 7.5;

/**
 * Does this role admit a student of `branch` with `cgpa`?
 *
 * Branch still never excludes when unstated — there is no sensible default for
 * "which branches does this company take", so an unrecorded role stays visible
 * to everyone. CGPA does have a default, above.
 */
function admits(role: RoleEligibility, branch: string, cgpa: number | null): boolean {
  if (branch && !role.openToAllBranches && role.eligibleBranches.length > 0) {
    if (!role.eligibleBranches.includes(branch)) return false;
  }
  if (cgpa !== null) {
    const cutoff = role.minCgpa ?? ASSUMED_MIN_CGPA;
    if (cutoff > cgpa) return false;
  }
  return true;
}

export function Companies() {
  const { data, error, loading } = useFetch(api.companies, "companies");
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [cgpaText, setCgpaText] = useState("");

  const companies = useMemo(() => data?.companies ?? [], [data]);

  // Offered branches come from the data itself rather than a hard-coded list,
  // so a new company introducing a new branch code needs no code change.
  const branches = useMemo(
    () => [...new Set(companies.flatMap((c) => c.roles.flatMap((r) => r.eligibleBranches)))].sort(),
    [companies]
  );

  const cgpa = cgpaText.trim() === "" ? null : Number(cgpaText);
  const cgpaValid = cgpa === null || (!Number.isNaN(cgpa) && cgpa >= 0 && cgpa <= 10);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      // Search covers role names too, so "data engineer" finds the company that
      // hires one without you knowing which company that is.
      const matchesText =
        q === "" ||
        c.name.toLowerCase().includes(q) ||
        c.roles.some((r) => r.name.toLowerCase().includes(q));
      if (!matchesText) return false;

      const filtering = branch !== "" || (cgpa !== null && cgpaValid);
      if (!filtering) return true;
      // A company survives if ANY of its roles admits you.
      return c.roles.some((r) => admits(r, branch, cgpaValid ? cgpa : null));
    });
  }, [companies, query, branch, cgpa, cgpaValid]);

  if (loading) return <p className="centered">Loading companies…</p>;
  if (error) return <p className="error">{error}</p>;

  const filtering = query !== "" || branch !== "" || (cgpa !== null && cgpaValid);

  return (
    <>
      <Breadcrumbs items={[{ label: "Companies" }]} />
      <p className="eyebrow">The catalogue</p>
      <h1>Companies</h1>
      <p className="muted">Pick a company to see its roles and interview rounds.</p>

      {companies.length === 0 ? (
        <p className="muted">
          No companies yet. Run <code>npm run db:seed</code> in the backend folder.
        </p>
      ) : (
        <>
          <div className="filters">
            <div className="filter-field">
              <label htmlFor="co-search" className="field-label">Search</label>
              <input
                id="co-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Company or role"
              />
            </div>

            <div className="filter-field">
              <label htmlFor="co-branch" className="field-label">Branch</label>
              <select
                id="co-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="">Any</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="co-cgpa" className="field-label">Your CGPA</label>
              <input
                id="co-cgpa"
                type="number"
                min="0"
                max="10"
                step="0.01"
                value={cgpaText}
                onChange={(e) => setCgpaText(e.target.value)}
                placeholder="8.5"
              />
            </div>

            {filtering && (
              <button
                type="button"
                className="linkish"
                onClick={() => {
                  setQuery("");
                  setBranch("");
                  setCgpaText("");
                }}
              >
                Clear
              </button>
            )}
          </div>

          {!cgpaValid && <p className="error small">CGPA should be a number between 0 and 10.</p>}

          <p className="muted small count-line">
            {filtering
              ? `${shown.length} of ${companies.length} companies`
              : `${companies.length} companies`}
            {/* Stated once here rather than tagged onto every row: the
                assumption is real and the student should know it is being
                applied, but it is not per-company news. */}
            {cgpa !== null && cgpaValid && (
              <> · cutoffs not on record assumed to be {ASSUMED_MIN_CGPA.toFixed(1)}</>
            )}
          </p>

          {shown.length === 0 ? (
            <p className="muted">Nothing matches those filters.</p>
          ) : (
            <ul className="tiles">
              {shown.map((c) => {
                const cutoff = c.roles
                  .map((r) => r.minCgpa)
                  .filter((n): n is number => n !== null)
                  .sort((a, b) => a - b)[0];
                return (
                  <li key={c.id}>
                    <Link to={`/companies/${c.id}`} className="tile">
                      <CompanyMark name={c.name} />
                      <span className="tile-title">{c.name}</span>
                      <span className="tile-meta">
                        <span className="muted small">
                          {c.roleCount} {c.roleCount === 1 ? "role" : "roles"}
                        </span>
                        {cutoff !== undefined && (
                          <span className="badge badge-cutoff">CGPA {cutoff.toFixed(1)}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
