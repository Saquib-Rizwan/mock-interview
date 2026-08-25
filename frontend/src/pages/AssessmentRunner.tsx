import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type AttemptResult, type AttemptReview } from "../api";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { useFetch } from "../useFetch";

function mmss(totalSec: number) {
  const s = Math.max(0, totalSec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function AssessmentRunner() {
  const { id = "" } = useParams();
  const { data, error, loading } = useFetch(api.assessment, id);

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [review, setReview] = useState<AttemptReview | null>(null);

  const assessment = data?.assessment;

  // Flattened once, so navigation is a single index rather than a
  // section/question pair that has to be kept consistent.
  const questions = useMemo(
    () =>
      (assessment?.sections ?? []).flatMap((s) =>
        s.questions.map((q) => ({ ...q, sectionName: s.name }))
      ),
    [assessment]
  );

  // Answers live in a ref as well as state: the submit path and the interval
  // both need the latest value, and neither can read through a stale closure.
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const submit = useCallback(
    async (auto: boolean) => {
      if (!attemptId || result) return;
      setBusy(true);
      setRunError(null);
      try {
        const { result: r } = await api.submitAttempt(attemptId, answersRef.current);
        setResult(r);
      } catch (err) {
        setRunError(
          err instanceof Error
            ? err.message
            : auto
              ? "Time is up but the test could not be submitted."
              : "Could not submit."
        );
      } finally {
        setBusy(false);
      }
    },
    [attemptId, result]
  );

  const submitRef = useRef(submit);
  submitRef.current = submit;

  // The clock ticks off the server's startedAt rather than a local countdown,
  // so reloading the page cannot buy extra time.
  useEffect(() => {
    if (!startedAt || result) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, result]);

  const limitSec = assessment?.totalDurationMin ? assessment.totalDurationMin * 60 : null;
  const elapsedSec = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const remainingSec = limitSec === null ? null : limitSec - elapsedSec;

  useEffect(() => {
    if (remainingSec !== null && remainingSec <= 0 && !result && attemptId && !busy) {
      void submitRef.current(true);
    }
  }, [remainingSec, result, attemptId, busy]);

  async function begin() {
    setBusy(true);
    setRunError(null);
    try {
      const { attempt } = await api.startAttempt(id);
      setAttemptId(attempt.id);
      setStartedAt(new Date(attempt.startedAt).getTime());
      setAnswers(attempt.answers ?? {});
      setNow(Date.now());
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Could not start the test.");
    } finally {
      setBusy(false);
    }
  }

  function choose(questionId: string, index: number) {
    if (result) return;
    const next = { ...answersRef.current };
    // Clicking the chosen option again clears it. Under negative marking an
    // unanswered question costs nothing while a wrong one costs marks, so
    // being able to withdraw a guess is a real part of taking the test.
    if (next[questionId] === index) delete next[questionId];
    else next[questionId] = index;
    setAnswers(next);
    if (attemptId) void api.saveAnswers(attemptId, next).catch(() => {});
  }

  if (loading) return <p className="centered">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!assessment) return null;

  const { round } = assessment;
  const crumbs = [
    { label: "Companies", to: "/" },
    { label: round.role.company.name, to: `/companies/${round.role.company.id}` },
    { label: round.role.name, to: `/roles/${round.role.id}` },
    { label: round.roundName, to: `/rounds/${round.id}` },
    { label: "Mock test" },
  ];

  // ---- result ------------------------------------------------------------
  if (result) {
    const pct = result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;
    return (
      <>
        <Breadcrumbs items={crumbs} />
        <p className="eyebrow">{round.role.company.name}</p>
        <h1>Test complete</h1>

        <div className="score-block">
          <span className="score-figure">{result.score}</span>
          <span className="score-of">out of {result.maxScore}</span>
        </div>
        <p className="muted">
          {pct.toFixed(0)}% · finished in {mmss(result.elapsedSec)}
        </p>

        <ul className="score-lines">
          <li>
            <strong>{result.correctCount}</strong> correct
          </li>
          <li>
            <strong>{result.wrongCount}</strong> wrong
            {result.negativeMarking
              ? ` · −${(result.wrongCount * result.negativeMarking).toFixed(2)} marks`
              : ""}
          </li>
          <li>
            <strong>{result.unansweredCount}</strong> unanswered
            {result.negativeMarking ? " · cost nothing" : ""}
          </li>
        </ul>

        {result.negativeMarking !== null && (
          <p className="note">
            Negative marking of {result.negativeMarking} per wrong answer applied.
            Leaving a question blank costs nothing, which is why guessing is only
            worth it when you can rule some options out.
          </p>
        )}

        {!review && (
          <>
            {runError && <p className="error">{runError}</p>}
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                setRunError(null);
                try {
                  const { review: r } = await api.attemptReview(attemptId!);
                  setReview(r);
                } catch (err) {
                  setRunError(err instanceof Error ? err.message : "Could not load the answers.");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              {busy ? "Loading…" : "See the answers"}
            </button>
          </>
        )}

        {review && (
          <>
            <hr className="rule" />
            {review.sections.map((section) => (
              <section key={section.id}>
                {review.sections.length > 1 && <h2>{section.name}</h2>}
                <ol className="review-list">
                  {section.questions.map((rq, i) => (
                    <li
                      key={rq.id}
                      className={
                        rq.chosenIndex === null
                          ? "is-skipped"
                          : rq.correct
                            ? "is-right"
                            : "is-wrong"
                      }
                    >
                      <div className="review-head">
                        <span className="review-num">{i + 1}</span>
                        <span className="review-verdict">
                          {rq.chosenIndex === null
                            ? "not answered"
                            : rq.correct
                              ? "correct"
                              : "wrong"}
                        </span>
                        <span className="review-marks">
                          {rq.marks > 0 ? `+${rq.marks}` : rq.marks}
                        </span>
                      </div>

                      <p className="question-text">{rq.text}</p>

                      <ul className="review-options">
                        {rq.options.map((opt, oi) => (
                          <li
                            key={oi}
                            className={
                              (oi === rq.correctIndex ? "is-key " : "") +
                              (oi === rq.chosenIndex ? "is-yours" : "")
                            }
                          >
                            <span className="mcq-letter">{String.fromCharCode(65 + oi)}</span>
                            <span>{opt}</span>
                            {oi === rq.correctIndex && (
                              <span className="review-tag">correct answer</span>
                            )}
                            {oi === rq.chosenIndex && oi !== rq.correctIndex && (
                              <span className="review-tag">you chose this</span>
                            )}
                          </li>
                        ))}
                      </ul>

                      {rq.solution && <p className="note">{rq.solution}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}

        <p className="muted small">
          <Link to={`/rounds/${round.id}`}>Back to the round</Link>
        </p>
      </>
    );
  }

  // ---- not started -------------------------------------------------------
  if (!attemptId) {
    const total = questions.length;
    return (
      <>
        <Breadcrumbs items={crumbs} />
        <p className="eyebrow">{round.role.company.name}</p>
        <h1>{round.roundName}</h1>

        <ul className="score-lines">
          <li>
            <strong>{total}</strong> questions
          </li>
          <li>
            <strong>
              {assessment.totalDurationMin ? `${assessment.totalDurationMin} min` : "untimed"}
            </strong>{" "}
            {assessment.totalDurationMin ? "limit" : "— no duration recorded"}
          </li>
          <li>
            <strong>
              {assessment.negativeMarking ? `−${assessment.negativeMarking}` : "none"}
            </strong>{" "}
            per wrong answer
          </li>
        </ul>

        <p className="note">
          The clock starts when you begin and runs on the server, so reloading
          will not give you more time. Answers save as you go and can be changed
          until you submit.
        </p>

        {runError && <p className="error">{runError}</p>}
        <button type="button" onClick={begin} disabled={busy || total === 0}>
          {busy ? "Starting…" : "Start the test"}
        </button>
        {total === 0 && (
          <p className="muted small">This assessment has no questions attached yet.</p>
        )}
      </>
    );
  }

  // ---- taking it ---------------------------------------------------------
  const q = questions[cursor];
  const answeredCount = Object.keys(answers).length;
  const low = remainingSec !== null && remainingSec <= 60;

  return (
    <>
      <Breadcrumbs items={crumbs} />

      <div className="test-bar">
        <span className="muted small">
          {round.role.company.name} · {q?.sectionName}
        </span>
        {remainingSec !== null && (
          <span className={`test-clock${low ? " is-low" : ""}`}>{mmss(remainingSec)}</span>
        )}
        <span className="muted small">
          {answeredCount} of {questions.length} answered
        </span>
      </div>

      {/* Every question reachable at once: the source says nothing about
          forbidding revisits, and canRevisit defaults true. */}
      <ol className="test-grid">
        {questions.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              className={
                "test-pip" +
                (i === cursor ? " is-current" : "") +
                (answers[item.id] !== undefined ? " is-answered" : "")
              }
              onClick={() => setCursor(i)}
              aria-label={`Question ${i + 1}`}
            >
              {i + 1}
            </button>
          </li>
        ))}
      </ol>

      {q && (
        <>
          <p className="eyebrow">
            Question {cursor + 1} of {questions.length}
          </p>
          <h1 className="lead">{q.text}</h1>

          <ul className="mcq-choices">
            {q.options.map((opt, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={"mcq-choice" + (answers[q.id] === i ? " is-chosen" : "")}
                  onClick={() => choose(q.id, i)}
                >
                  <span className="mcq-letter">{String.fromCharCode(65 + i)}</span>
                  <span>{opt}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="answer-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setCursor((c) => Math.max(0, c - 1))}
              disabled={cursor === 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setCursor((c) => Math.min(questions.length - 1, c + 1))}
              disabled={cursor >= questions.length - 1}
            >
              Next
            </button>
          </div>
        </>
      )}

      {runError && <p className="error">{runError}</p>}

      <hr className="rule" />
      <p className="muted small">
        {questions.length - answeredCount} unanswered. Submitting ends the test.
      </p>
      <button type="button" onClick={() => submit(false)} disabled={busy}>
        {busy ? "Submitting…" : "Submit test"}
      </button>
    </>
  );
}
