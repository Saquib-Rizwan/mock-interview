import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Breadcrumbs } from "../components/Breadcrumbs";
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
      <h1>{role.name}</h1>
      <p className="muted">
        {role.company.name} — {role.rounds.length}{" "}
        {role.rounds.length === 1 ? "round" : "rounds"}, in order.
      </p>

      <ol className="rounds">
        {role.rounds.map((round) => (
          <li key={round.id}>
            <Link to={`/rounds/${round.id}`} className="tile">
              <span className="round-index" aria-hidden="true">
                {round.order}
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
