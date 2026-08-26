import type { AttemptReview } from "../api";

/**
 * The per-question review of a finished mock test.
 *
 * Extracted from AssessmentRunner so it can be shown in two places: straight
 * after submitting, and when reopening an old attempt from progress or from the
 * assessment's history. The data comes from one endpoint that refuses unless
 * the attempt has been submitted, so neither caller can render it early.
 */
export function AttemptReviewView({ review }: { review: AttemptReview }) {
  return (
    <>
      {review.sections.map((section) => (
        <section key={section.id}>
          {/* Only worth a heading when there is more than one to tell apart. */}
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
  );
}
