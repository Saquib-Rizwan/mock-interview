import { useParams } from "react-router-dom";
import { api } from "../api";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { CATEGORY_LABELS, ROUND_TYPE_LABELS } from "../components/labels";
import { useFetch } from "../useFetch";

export function RoundDetail() {
  const { id = "" } = useParams();
  const { data, error, loading } = useFetch(api.round, id);

  if (loading) return <p className="centered">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  const { round } = data;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Companies", to: "/" },
          { label: round.role.company.name, to: `/companies/${round.role.company.id}` },
          { label: round.role.name, to: `/roles/${round.role.id}` },
          { label: round.roundName },
        ]}
      />

      <h1>
        {round.roundName}{" "}
        <span className={`badge badge-${round.roundType}`}>
          {ROUND_TYPE_LABELS[round.roundType]}
        </span>
      </h1>
      <p className="muted">
        Round {round.order} of {round.role.name} at {round.role.company.name}.
      </p>
      {round.notes && <p className="note">{round.notes}</p>}

      <h2>
        {round.questions.length}{" "}
        {round.questions.length === 1 ? "question" : "questions"}
      </h2>

      {round.questions.length === 0 ? (
        <p className="muted">No questions attached to this round yet.</p>
      ) : (
        <ul className="questions">
          {round.questions.map((q) => (
            <li key={q.id} className="question">
              <p className="question-text">{q.text}</p>
              <div className="tags">
                <span className="badge">{CATEGORY_LABELS[q.category]}</span>
                <span className={`badge badge-${q.difficulty}`}>{q.difficulty}</span>
                {q.questionType === "coding" && <span className="badge">Coding</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="muted small">
        Answering is not built yet — that comes in the next phase.
      </p>
    </>
  );
}
