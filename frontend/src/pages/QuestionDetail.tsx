import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, type PointVerdict, type Submission } from "../api";
import { Breadcrumbs, type Crumb } from "../components/Breadcrumbs";
import { CATEGORY_LABELS } from "../components/labels";
import { useFetch } from "../useFetch";
import { CodingWorkspace } from "./CodingWorkspace";

export function QuestionDetail() {
  const { id = "" } = useParams();
  // Optional: lets the page link back to the round it was opened from without
  // needing a question -> round lookup the schema does not cheaply support.
  const [params] = useSearchParams();
  const fromRound = params.get("round");

  const { data, error, loading } = useFetch(api.question, id);

  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [points, setPoints] = useState<PointVerdict[] | null>(null);
  const [history, setHistory] = useState<Submission[]>([]);

  useEffect(() => {
    if (!id) return;
    api
      .submissionsFor(id)
      .then(({ submissions }) => setHistory(submissions))
      .catch(() => setHistory([]));
  }, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setBusy(true);
    try {
      const { submission, points } = await api.submit(id, answer);
      setPoints(points);
      setHistory((prev) => [submission, ...prev]);
      setAnswer("");
    } catch (err) {
      // The typed answer is deliberately left in the box so a failed grading
      // attempt does not lose the student's work.
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="centered">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  const { question } = data;
  const latest = history[0];

  const crumbs: Crumb[] = [
    { label: "Companies", to: "/" },
    ...(fromRound ? [{ label: "Round", to: `/rounds/${fromRound}` }] : []),
    { label: "Question" },
  ];

  return (
    <>
      <Breadcrumbs items={crumbs} />

      <h1>{CATEGORY_LABELS[question.category]}</h1>
      <p className="question-text lead">{question.text}</p>
      <div className="tags">
        <span className={`badge badge-${question.difficulty}`}>
          {question.difficulty}
        </span>
        {question.questionType === "coding" ? (
          <span className="badge">graded by test cases</span>
        ) : (
          <span className="badge">
            graded against {question.expectedPointCount}{" "}
            {question.expectedPointCount === 1 ? "point" : "points"}
          </span>
        )}
      </div>

      {question.questionType === "coding" ? (
        <CodingWorkspace questionId={id} />
      ) : (
        <form onSubmit={onSubmit}>
          <label htmlFor="answer">Your answer</label>
          <textarea
            id="answer"
            rows={8}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Answer as you would in the interview…"
            required
          />
          {submitError && <p className="error">{submitError}</p>}
          <button type="submit" disabled={busy || !answer.trim()}>
            {busy ? "Analysing…" : "Submit answer"}
          </button>
          {busy && (
            <p className="muted small">
              Comparing your answer against the expected points. This can take a
              few seconds.
            </p>
          )}
        </form>
      )}

      {latest && (
        <section>
          <h2>Feedback</h2>

          {points && (
            <ul className="verdicts">
              {points.map((p, i) => (
                <li key={i} className={p.covered ? "covered" : "missed"}>
                  <span className="verdict-mark" aria-hidden="true">
                    {p.covered ? "✓" : "✗"}
                  </span>
                  <span>
                    <strong>{p.point}</strong>
                    <br />
                    <span className="muted small">{p.comment}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3>What was missing</h3>
          <p className="feedback">{latest.gapAnalysis}</p>

          <details className="suggested">
            <summary>Show a stronger answer</summary>
            <p className="feedback">{latest.suggestedAnswer}</p>
          </details>
        </section>
      )}

      {history.length > 1 && (
        <section>
          <h2>Earlier attempts ({history.length - 1})</h2>
          <ul className="attempts">
            {history.slice(1).map((s) => (
              <li key={s.id}>
                <p className="muted small">
                  {new Date(s.createdAt).toLocaleString()}
                </p>
                <p className="attempt-answer">{s.answerText}</p>
                <p className="muted small">{s.gapAnalysis}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fromRound && (
        <p className="muted small">
          <Link to={`/rounds/${fromRound}`}>← Back to the round</Link>
        </p>
      )}
    </>
  );
}
