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
      // The answer stays in the box on success as well as on failure.
      // Clearing it was wrong twice over: a long answer written slowly vanished
      // the moment it was graded, and the per-point verdicts are only useful
      // while you can still see the text they refer to. Revising and
      // resubmitting is the normal loop here, not the exception — and every
      // attempt is kept in the history below regardless.
    } catch (err) {
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

  // Shown under the answer box. Interview answers are judged partly on whether
  // you said enough, so a live count is genuinely useful rather than decorative.
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const coveredCount = points?.filter((p) => p.covered).length ?? 0;

  const crumbs: Crumb[] = [
    { label: "Companies", to: "/" },
    ...(fromRound ? [{ label: "Round", to: `/rounds/${fromRound}` }] : []),
    { label: "Question" },
  ];

  return (
    <>
      <Breadcrumbs items={crumbs} />

      {/* The question is the headline, not the subject. The subject is an
          eyebrow above it — the arrangement of an article, and the thing that
          makes the page read as something to concentrate on. */}
      <p className="eyebrow">{CATEGORY_LABELS[question.category]}</p>
      <h1 className="lead">{question.text}</h1>
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
          {/* The wrapper exists to carry the registration marks — a textarea
              cannot host pseudo-elements of its own. */}
          <div className="field">
            <textarea
              id="answer"
              rows={8}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Answer as you would in the interview…"
              required
            />
          </div>
          {submitError && <p className="error">{submitError}</p>}
          <div className="answer-actions">
            <span className="wordcount">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
            <button type="submit" disabled={busy || !answer.trim()}>
              {busy ? "Analysing…" : "Submit answer"}
            </button>
          </div>
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
            <>
              {/* The score as a plain sentence. A ring or a percentage would
                  make this a scorecard; the useful information is which points
                  were missed, and that is the list underneath. */}
              <p className="verdict-summary">
                You covered {coveredCount} of {points.length}{" "}
                {points.length === 1 ? "point" : "points"}.
              </p>
              <ul className="verdicts">
                {points.map((p, i) => (
                  <li key={i} className={p.covered ? "covered" : "missed"}>
                    {/* Typographic marks in the mono face rather than an icon
                        font — nothing here should need a network request. */}
                    <span className="verdict-mark" aria-hidden="true">
                      {p.covered ? "+" : "–"}
                    </span>
                    <span>
                      {p.point}
                      <br />
                      <span className="muted small">{p.comment}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
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
