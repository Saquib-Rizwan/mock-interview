import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { CompanyMark } from "../components/CompanyMark";
import { useFetch } from "../useFetch";

export function CompanyDetail() {
  const { id = "" } = useParams();
  const { data, error, loading } = useFetch(api.company, id);

  if (loading) return <p className="centered">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  const { company } = data;

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Companies", to: "/" }, { label: company.name }]}
      />
      {/* The monogram at page scale, so arriving at a company feels like
          arriving somewhere specific rather than at another list. */}
      <div className="page-head">
        <CompanyMark name={company.name} size="lg" />
        <div>
          <p className="eyebrow">Company</p>
          <h1>{company.name}</h1>
        </div>
      </div>
      <p className="muted">Roles this company recruits for.</p>

      <ul className="tiles">
        {company.roles.map((role) => (
          <li key={role.id}>
            <Link to={`/roles/${role.id}`} className="tile">
              <span className="tile-title">{role.name}</span>
              <span className="muted small">
                {role.roundCount} {role.roundCount === 1 ? "round" : "rounds"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
