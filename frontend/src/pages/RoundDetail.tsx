import { Link, useParams } from "react-router-dom";
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
  const answered = round.questions.filter((q) => q.attempted).length;

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
        {answered === 0
          ? `${round.questions.length} ${round.questions.length === 1 ? "question" : "questions"}`
          : `${answered} of ${round.questions.length} answered`}
      </h2>

      {round.questions.length === 0 ? (
        <p className="muted">
          No practice questions for this round
          {round.notes ? " — what to prepare is in the note above." : "."}
        </p>
      ) : (
        <ul className="questions">
          {round.questions.map((q) => (
            <li key={q.id} className={q.attempted ? "is-done" : undefined}>
              {/* Carries the round id so the question page can link back. */}
              <Link to={`/questions/${q.id}?round=${round.id}`} className="question">
                <p className="question-text">{q.text}</p>
                <div className="tags">
                  <span className="badge">{CATEGORY_LABELS[q.category]}</span>
                  <span className={`badge badge-${q.difficulty}`}>{q.difficulty}</span>
                  {q.questionType === "coding" && <span className="badge">Coding</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="muted small">
        Click a question to answer it and get feedback. A rule in the margin
        marks the ones you have already attempted — it says nothing about how
        you scored.
      </p>
    </>
  );
}
