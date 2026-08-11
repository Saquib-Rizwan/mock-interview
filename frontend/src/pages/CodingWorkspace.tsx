import { useCallback, useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  api,
  type CodeReview,
  type CodeSubmission,
  type CodingLanguage,
  type RunResult,
  type TestOutcome,
} from "../api";
import { useFetch } from "../useFetch";
import { VERMILION_THEME_NAME, defineVermilionTheme } from "./monacoTheme";

/**
 * Draft code is kept per question *and* per language, so switching from Python
 * to C++ and back does not lose either attempt. Stored in localStorage rather
 * than on the server: an unrun draft is not a submission, and persisting every
 * keystroke server-side would be a lot of writes for very little value.
 */
function draftKey(questionId: string, language: CodingLanguage) {
  return `mockinterview.code.${questionId}.${language}`;
}

/** Sample inputs are stored as a JSON array of arguments; show them readably. */
function formatArgs(json: string): string {
  try {
    const args = JSON.parse(json) as unknown[];
    return args.map((a) => JSON.stringify(a)).join(", ");
  } catch {
    return json;
  }
}

export function CodingWorkspace({ questionId }: { questionId: string }) {
  const { data, error, loading } = useFetch(api.codingQuestion, questionId);

  const [language, setLanguage] = useState<CodingLanguage>("python");
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<CodeSubmission[]>([]);
  const [review, setReview] = useState<CodeReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const question = data?.question;

  // Load the saved draft for this language, falling back to the starter code.
  useEffect(() => {
    if (!question) return;
    const saved = localStorage.getItem(draftKey(question.id, language));
    setCode(saved ?? question.starterCode[language] ?? "");
  }, [question, language]);

  useEffect(() => {
    if (!questionId) return;
    api
      .codeSubmissionsFor(questionId)
      .then(({ submissions }) => setHistory(submissions))
      .catch(() => setHistory([]));
  }, [questionId]);

  const onCodeChange = useCallback(
    (value: string | undefined) => {
      const next = value ?? "";
      setCode(next);
      if (question) localStorage.setItem(draftKey(question.id, language), next);
    },
    [question, language]
  );

  function resetToStarter() {
    if (!question) return;
    const starter = question.starterCode[language] ?? "";
    setCode(starter);
    localStorage.removeItem(draftKey(question.id, language));
  }

  async function run() {
    if (!question) return;
    setRunError(null);
    setRunning(true);
    // A new run means the previous review describes code that no longer exists.
    setReview(null);
    setReviewError(null);
    try {
      const outcome = await api.runCode(question.id, language, code);
      setResult(outcome);
      if (outcome.submission) setHistory((prev) => [outcome.submission!, ...prev]);
    } catch (err) {
      // The editor contents are deliberately untouched so a failed run never
      // costs the student their work.
      setRunError(err instanceof Error ? err.message : "Could not run your code");
    } finally {
      setRunning(false);
    }
  }

  async function requestReview() {
    const submissionId = result?.submission?.id;
    if (!submissionId) return;
    setReviewError(null);
    setReviewing(true);
    try {
      const { review } = await api.reviewCode(submissionId);
      setReview(review);
    } catch (err) {
      // Test results stay on screen regardless: this is commentary, and its
      // failure must never look like a change to the verdict.
      setReviewError(err instanceof Error ? err.message : "Could not get a review");
    } finally {
      setReviewing(false);
    }
  }

  if (loading) return <p className="centered">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!question) return null;

  const signature = `${question.returnType} ${question.functionName}(${question.paramTypes.join(", ")})`;
  const passed = result?.submission?.passedCount ?? 0;
  const total = result?.submission?.totalCount ?? 0;
  const allPassed = result?.submission != null && passed === total;

  return (
    <div className="coding">
      <div className="coding-signature">
        <span className="muted small">Implement</span>
        <code>{signature}</code>
      </div>

      <section className="coding-samples">
        <h2>Examples</h2>
        <ul>
          {question.sampleTests.map((t) => (
            <li key={t.id}>
              <code className="io">{formatArgs(t.input)}</code>
              <span aria-hidden="true"> → </span>
              <code className="io">{t.expected}</code>
            </li>
          ))}
        </ul>
        {question.hiddenTestCount > 0 && (
          <p className="muted small">
            Plus {question.hiddenTestCount} hidden test{" "}
            {question.hiddenTestCount === 1 ? "case" : "cases"} you cannot see.
          </p>
        )}
      </section>

      <div className="coding-toolbar">
        <label htmlFor="language" className="muted small">
          Language
        </label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as CodingLanguage)}
        >
          {question.languages.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>

        <button type="button" className="secondary" onClick={resetToStarter}>
          Reset
        </button>

        <button type="button" onClick={run} disabled={running || !code.trim()}>
          {running ? "Running…" : "Run tests"}
        </button>
      </div>

      <div className="coding-editor">
        <Editor
          height="440px"
          language={question.languages.find((l) => l.id === language)?.monacoId ?? language}
          // Registered before mount: naming a theme Monaco has not been given
          // yet renders the editor with no highlighting at all on first paint.
          beforeMount={defineVermilionTheme}
          theme={VERMILION_THEME_NAME}
          value={code}
          onChange={onCodeChange}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            // The same face the rest of the app sets code and data in, so the
            // editor is not the one place with a different monospace.
            fontFamily: '"JetBrains Mono Variable", ui-monospace, Consolas, monospace',
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            tabSize: 4,
            automaticLayout: true,
          }}
        />
      </div>

      {running && (
        <p className="muted small">
          Compiling and running against {question.sampleTests.length + question.hiddenTestCount}{" "}
          test cases. C++ and Java take longer — they compile first.
        </p>
      )}

      {runError && <p className="error">{runError}</p>}

      {result?.compileError && (
        <section className="coding-results">
          <h2>Compile error</h2>
          <pre className="compile-error">{result.compileError}</pre>
        </section>
      )}

      {result?.timedOut && (
        <p className="error">
          Your code ran out of time. Check for an infinite loop — later test cases
          did not run.
        </p>
      )}

      {result && result.submission && (
        <section className="coding-results">
          <h2>
            {allPassed ? "All tests passed" : "Results"}{" "}
            <span className={allPassed ? "score pass" : "score fail"}>
              {passed} / {total}
            </span>
          </h2>

          <ul className="test-results">
            {result.results.map((t) => (
              <TestRow key={t.testCaseId} test={t} />
            ))}
          </ul>

          {/* Separate action, not part of running: the verdict above is already
              final, and this only ever adds commentary on top of it. */}
          {!review && (
            <div className="review-prompt">
              <button type="button" className="secondary" onClick={requestReview} disabled={reviewing}>
                {reviewing ? "Reviewing…" : "Review my approach"}
              </button>
              <span className="muted small">
                Comments on approach and complexity. Doesn&apos;t change your score.
              </span>
            </div>
          )}

          {reviewError && <p className="error">{reviewError}</p>}

          {review && <ReviewPanel review={review} />}
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h2>Earlier attempts ({history.length})</h2>
          <ul className="attempts">
            {history.map((s) => (
              <li key={s.id}>
                <p className="muted small">
                  {new Date(s.createdAt).toLocaleString()} · {s.language} ·{" "}
                  <span className={s.passedCount === s.totalCount ? "score pass" : "score fail"}>
                    {s.passedCount}/{s.totalCount}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReviewPanel({ review }: { review: CodeReview }) {
  return (
    <div className="review">
      <h3>Approach</h3>
      <p className="feedback">{review.summary}</p>

      <div className="complexity">
        <span>
          <span className="muted small">Time</span> <code className="io">{review.time_complexity}</code>
        </span>
        <span>
          <span className="muted small">Space</span> <code className="io">{review.space_complexity}</code>
        </span>
      </div>

      {review.strengths.length > 0 && (
        <>
          <h3>What worked</h3>
          <ul className="review-points">
            {review.strengths.map((s, i) => (
              <li key={i} className="covered">
                <span className="verdict-mark" aria-hidden="true">
                  +
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {review.improvements.length > 0 && (
        <>
          <h3>What to tighten</h3>
          <ul className="review-points">
            {review.improvements.map((s, i) => (
              <li key={i}>
                <span className="verdict-mark" aria-hidden="true">
                  →
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="muted small">
        Commentary from a language model. Your pass/fail score above came from
        running the tests and is not affected by anything here.
      </p>
    </div>
  );
}

function TestRow({ test }: { test: TestOutcome }) {
  return (
    <li className={test.passed ? "covered" : "missed"}>
      {/* Same marks as the written-answer verdicts, so pass/fail reads
          identically whichever kind of question the student is on. */}
      <span className="verdict-mark" aria-hidden="true">
        {test.passed ? "+" : "–"}
      </span>
      <div>
        <strong>
          {test.isSample ? `Example ${test.orderIndex + 1}` : `Hidden test ${test.orderIndex + 1}`}
        </strong>

        {/* Hidden cases show pass/fail and any error, never their data. */}
        {test.isSample && test.input !== undefined && (
          <div className="test-detail">
            <div>
              <span className="muted small">Input</span>
              <code className="io">{formatArgs(test.input)}</code>
            </div>
            <div>
              <span className="muted small">Expected</span>
              <code className="io">{test.expected}</code>
            </div>
            {!test.passed && (
              <div>
                <span className="muted small">Got</span>
                <code className="io">{test.actual ?? "—"}</code>
              </div>
            )}
          </div>
        )}

        {test.error && <p className="muted small test-error">{test.error}</p>}
      </div>
    </li>
  );
}
