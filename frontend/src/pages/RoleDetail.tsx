import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { CompanyMark } from "../components/CompanyMark";
import { ROUND_TYPE_LABELS } from "../components/labels";
import { useFetch } from "../useFetch";

export function RoleDetail() {
  const { id = "" } = useParams();
  const { data, error, loading } = useFetch(api.role, id);

  if (loading) return <p className="centered">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  const { role } = data;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Companies", to: "/" },
          { label: role.company.name, to: `/companies/${role.company.id}` },
          { label: role.name },
        ]}
      />
      <div className="page-head">
        <CompanyMark name={role.company.name} size="lg" />
        <div>
          <p className="eyebrow">{role.company.name}</p>
          <h1>{role.name}</h1>
        </div>
      </div>
      <p className="muted">
        {role.rounds.length} {role.rounds.length === 1 ? "round" : "rounds"}, in
        the order you would actually sit them.
      </p>

      {/* Drawn as a connected spine rather than a list of boxes. A hiring
          process *is* a sequence, and showing it as one is the clearest thing
          this page can do — you can see how far in a round sits before you
          click it. The connecting line is a CSS pseudo-element, so it needs no
          extra markup and cannot fall out of step with the items. */}
      <ol className="spine">
        {role.rounds.map((round) => (
          <li key={round.id}>
            <Link to={`/rounds/${round.id}`} className="spine-item">
              <span className="spine-node" aria-hidden="true">
                {String(round.order).padStart(2, "0")}
              </span>
              <span className="round-body">
                <span className="tile-title">{round.roundName}</span>
                {round.notes && <span className="muted small">{round.notes}</span>}
                <span className="muted small">
                  {round.questionCount}{" "}
                  {round.questionCount === 1 ? "question" : "questions"}
                </span>
              </span>
              <span className={`badge badge-${round.roundType}`}>
                {ROUND_TYPE_LABELS[round.roundType]}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
