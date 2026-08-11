import { Link } from "react-router-dom";
import { api, type RecentActivity } from "../api";
import { CATEGORY_LABELS } from "../components/labels";
import { useFetch } from "../useFetch";

const LANGUAGE_LABELS: Record<string, string> = {
  python: "Python",
  javascript: "JavaScript",
  cpp: "C++",
  java: "Java",
};

export function Progress() {
  const { data, error, loading } = useFetch(api.progress, "progress");

  if (loading) return <p className="centered">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  const { totals, subjects, languages, recurringGaps, readiness, recent } = data.progress;
  const nothingYet = totals.textAttempts === 0 && totals.codingAttempts === 0;

  if (nothingYet) {
    return (
      <>
        <h1>Your progress</h1>
        <p className="note">
          Nothing to show yet. Answer a few questions and this page will tell you
          which subjects are weakest and which points you keep missing.
        </p>
        <p>
          <Link to="/">Browse companies →</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Your progress</h1>

      <div className="stat-tiles">
        <Tile value={totals.textQuestions} label="questions answered" sub={`${totals.textAttempts} attempts`} />
        <Tile
          value={`${totals.codingSolved}/${totals.codingQuestions}`}
          label="coding solved"
          sub={`${totals.codingAttempts} runs`}
        />
        <Tile value={recurringGaps.length} label="recurring gaps" sub="points you keep missing" />
      </div>

      {subjects.length > 0 && (
        <section>
          <h2>By subject</h2>
          <p className="muted small">
            How much of each expected answer you covered. Weakest first.
          </p>
          <ul className="bars">
            {subjects.map((s) => (
              <li key={s.category}>
                <span className="bar-label">{CATEGORY_LABELS[s.category]}</span>
                <span className="bar-track">
                  {s.coveragePct !== null && (
                    <span
                      className={`bar-fill ${s.coveragePct < 50 ? "low" : s.coveragePct < 75 ? "mid" : "high"}`}
                      style={{ width: `${Math.max(s.coveragePct, 2)}%` }}
                    />
                  )}
                </span>
                <span className="bar-value">
                  {/* Unscored is not the same as zero, and must not look like it. */}
                  {s.coveragePct === null ? (
                    <span className="muted">not scored</span>
                  ) : (
                    `${s.coveragePct}%`
                  )}
                </span>
                <span className="muted small bar-note">{s.attempts} attempt{s.attempts === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recurringGaps.length > 0 && (
        <section>
          <h2>What you keep missing</h2>
          <p className="muted small">
            Expected points you have failed to cover more than once. This is the
            most useful list on the page.
          </p>
          <ul className="gaps">
            {recurringGaps.map((g) => (
              <li key={g.point}>
                <span className="gap-count">
                  {g.missed}/{g.seen}
                </span>
                <span>
                  {g.point}
                  <br />
                  <span className="muted small">{CATEGORY_LABELS[g.category]}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {languages.length > 0 && (
        <section>
          <h2>Coding by language</h2>
          <ul className="bars">
            {languages.map((l) => (
              <li key={l.language}>
                <span className="bar-label">{LANGUAGE_LABELS[l.language] ?? l.language}</span>
                <span className="bar-track">
                  {l.testPassRatePct !== null && (
                    <span
                      className={`bar-fill ${l.testPassRatePct < 50 ? "low" : l.testPassRatePct < 75 ? "mid" : "high"}`}
                      style={{ width: `${Math.max(l.testPassRatePct, 2)}%` }}
                    />
                  )}
                </span>
                <span className="bar-value">
                  {l.testPassRatePct === null ? "—" : `${l.testPassRatePct}%`}
                </span>
                <span className="muted small bar-note">
                  {l.solved} solved / {l.attempts} run{l.attempts === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {readiness.length > 0 && (
        <section>
          <h2>Company readiness</h2>
          <p className="muted small">How much of each role's question set you have attempted.</p>
          <ul className="bars">
            {readiness.slice(0, 8).map((r) => (
              <li key={r.roleId}>
                <span className="bar-label">
                  <Link to={`/roles/${r.roleId}`}>{r.companyName}</Link>
                  <br />
                  <span className="muted small">{r.roleName}</span>
                </span>
                <span className="bar-track">
                  <span className="bar-fill neutral" style={{ width: `${Math.max(r.pct, 1)}%` }} />
                </span>
                <span className="bar-value">
                  {r.attempted}/{r.totalQuestions}
                </span>
                <span className="muted small bar-note">{r.pct}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2>Recent attempts</h2>
          <ul className="attempts">
            {recent.map((a) => (
              <RecentRow key={`${a.kind}-${a.id}`} activity={a} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Tile({ value, label, sub }: { value: string | number; label: string; sub: string }) {
  // "7/12" is split so the total can be set small and muted beside the score.
  // At one size the reader has to work out which of the two numbers is the
  // answer; this says it in the type instead.
  const [score, total] = String(value).split("/");

  return (
    <div className="stat-tile">
      <span className="stat-value">
        {score}
        {total !== undefined && <span className="stat-den">/{total}</span>}
      </span>
      <span className="stat-label">{label}</span>
      <span className="muted small">{sub}</span>
    </div>
  );
}

function RecentRow({ activity: a }: { activity: RecentActivity }) {
  const scored = a.covered !== null && a.total !== null && a.total > 0;
  const good = scored && a.covered === a.total;

  return (
    <li>
      <p className="muted small">
        {new Date(a.createdAt).toLocaleString()} · {CATEGORY_LABELS[a.category]} ·{" "}
        {a.kind === "coding" ? "code" : "written"}
        {scored && (
          <>
            {" · "}
            <span className={good ? "score pass" : "score fail"}>
              {a.covered}/{a.total}
            </span>
          </>
        )}
      </p>
      <p className="attempt-answer">
        <Link to={`/questions/${a.questionId}`}>{a.questionText}</Link>
      </p>
    </li>
  );
}
