import { Link } from "react-router-dom";
import { api } from "../api";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { useFetch } from "../useFetch";

export function Companies() {
  const { data, error, loading } = useFetch(api.companies, "companies");

  if (loading) return <p className="centered">Loading companies…</p>;
  if (error) return <p className="error">{error}</p>;

  const companies = data?.companies ?? [];

  return (
    <>
      <Breadcrumbs items={[{ label: "Companies" }]} />
      <h1>Companies</h1>
      <p className="muted">Pick a company to see its roles and interview rounds.</p>

      {companies.length === 0 ? (
        <p className="muted">
          No companies yet. Run <code>npm run db:seed</code> in the backend folder.
        </p>
      ) : (
        <ul className="tiles">
          {companies.map((c) => (
            <li key={c.id}>
              <Link to={`/companies/${c.id}`} className="tile">
                <span className="tile-title">{c.name}</span>
                <span className="muted small">
                  {c.roleCount} {c.roleCount === 1 ? "role" : "roles"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
