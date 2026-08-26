import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { CATEGORY_LABELS, ROUND_TYPE_LABELS } from "../components/labels";
import { useFetch } from "../useFetch";

export function RoundDetail() {
  const { id = "" } = useParams();
  const { data, error, loading } = useFetch(api.round, id);
  const [briefingOpen, setBriefingOpen] = useState(false);

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
      {/* Facts first, prose second.
          The strip is built only from fields that are genuinely structured —
          round type, question count, and an assessment's duration and marking.
          Nothing here is parsed out of the note text, so nothing here can be
          wrong about a round whose note is worded unusually. */}
      <ul className="facts">
        <li>
          <span className="fact-label">Format</span>
          <span className="fact-value">{ROUND_TYPE_LABELS[round.roundType]}</span>
        </li>
        <li>
          <span className="fact-label">Questions</span>
          <span className="fact-value">{round.questions.length || "—"}</span>
        </li>
        {round.assessment && (
          <>
            <li>
              <span className="fact-label">Time limit</span>
              <span className="fact-value">
                {round.assessment.totalDurationMin
                  ? `${round.assessment.totalDurationMin} min`
                  : "—"}
              </span>
            </li>
            <li>
              <span className="fact-label">Wrong answer</span>
              <span className="fact-value">
                {round.assessment.negativeMarking
                  ? `−${round.assessment.negativeMarking}`
                  : "no penalty"}
              </span>
            </li>
          </>
        )}
      </ul>

      {round.notes && (
        <div className={`briefing${briefingOpen ? " is-open" : ""}`}>
          <p className="briefing-label">Round briefing</p>
          {/* Clamped to three lines until asked for. These notes carry every
              process detail the source document gave — format, outcome, tips —
              and printing all of it above the questions buried the questions. */}
          <p className="briefing-body">{round.notes}</p>
          <button
            type="button"
            className="linkish"
            onClick={() => setBriefingOpen((v) => !v)}
            aria-expanded={briefingOpen}
          >
            {briefingOpen ? "Show less" : "Read the full briefing"}
          </button>
        </div>
      )}

      {/* Additive: a round that is a timed test keeps its written practice
          questions below AND offers the mock. Neither replaces the other. */}
      {round.assessment && (
        <div className="mock-cta">
          <div>
            <p className="tile-title">Timed mock test</p>
            <p className="muted small">
              {round.assessment.totalDurationMin
                ? `${round.assessment.totalDurationMin} minutes`
                : "No time limit recorded"}
              {round.assessment.negativeMarking
                ? ` · −${round.assessment.negativeMarking} per wrong answer`
                : " · no negative marking"}
            </p>
          </div>
          <Link to={`/assessments/${round.assessment.id}`} className="cta-link">
            Take it
          </Link>
        </div>
      )}

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
