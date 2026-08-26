import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { AttemptReviewView } from "../components/AttemptReviewView";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { useFetch } from "../useFetch";

/**
 * One finished mock test, reopened.
 *
 * Before this existed a result was visible exactly once: you submitted, saw the
 * score, navigated away and it was gone — even though the attempt row and its
 * score had been stored all along. "Did I improve?" was unanswerable, which
 * made retaking a test far less useful than it should have been.
 *
 * No extra guard is needed here beyond the endpoint's own: the review route
 * refuses an unsubmitted attempt with a 409 and returns 404 for one belonging
 * to somebody else, so an unfinished or borrowed id simply shows the error.
 */
export function AttemptDetail() {
  const { id = "" } = useParams();
  const { data, error, loading } = useFetch(api.attemptReview, id);

  if (loading) return <p className="centered">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  const { review } = data;
  const questions = review.sections.flatMap((s) => s.questions);
  const correct = questions.filter((q) => q.correct).length;
  const wrong = questions.filter((q) => q.chosenIndex !== null && !q.correct).length;
  const skipped = questions.filter((q) => q.chosenIndex === null).length;
  const score = questions.reduce((sum, q) => sum + q.marks, 0);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Progress", to: "/progress" },
          { label: review.roundName, to: `/rounds/${review.roundId}` },
          { label: "Attempt" },
        ]}
      />
      <p className="eyebrow">{new Date(review.submittedAt).toLocaleString()}</p>
      <h1>{review.roundName}</h1>

      <div className="score-block">
        {/* Summed from the per-question marks rather than re-fetched, so the
            figure shown always agrees with the rows printed beneath it. */}
        <span className="score-figure">{Math.round(score * 100) / 100}</span>
        <span className="score-of">out of {questions.length}</span>
      </div>

      <ul className="score-lines">
        <li>
          <strong>{correct}</strong> correct
        </li>
        <li>
          <strong>{wrong}</strong> wrong
          {review.negativeMarking ? ` · −${(wrong * review.negativeMarking).toFixed(2)} marks` : ""}
        </li>
        <li>
          <strong>{skipped}</strong> unanswered
        </li>
      </ul>

      <hr className="rule" />
      <AttemptReviewView review={review} />

      <p className="muted small">
        <Link to={`/rounds/${review.roundId}`}>Back to the round</Link>
      </p>
    </>
  );
}
