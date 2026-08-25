import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { CompanyMark } from "../components/CompanyMark";
import { ROUND_TYPE_LABELS } from "../components/labels";
import { useFetch } from "../useFetch";

export function RoleDetail() {
  const { id = "" } = useParams();
  const { data, error, loading } = useFetch(api.role, id);

  if (loading) return <p className="centered">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  const { role } = data;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Companies", to: "/" },
          { label: role.company.name, to: `/companies/${role.company.id}` },
          { label: role.name },
        ]}
      />
      <div className="page-head">
        <CompanyMark name={role.company.name} size="lg" />
        <div>
          <p className="eyebrow">{role.company.name}</p>
          <h1>{role.name}</h1>
        </div>
      </div>
      <p className="muted">
        {role.rounds.length} {role.rounds.length === 1 ? "round" : "rounds"}, in
        the order you would actually sit them.
      </p>

      {/* Shown only where the source material actually stated it. A role with
          nothing on record says nothing at all rather than carrying a "not
          recorded" line on every page — the catalogue still never asserts an
          eligibility it was not given, it just stays quiet about the gap. The
          companies page applies a filtering default; see ASSUMED_MIN_CGPA. */}
      {(role.openToAllBranches ||
        role.eligibleBranches.length > 0 ||
        role.minCgpa !== null) && (
        <p className="muted small">
          {role.openToAllBranches
            ? "Open to all branches."
            : role.eligibleBranches.length > 0
              ? `Eligible branches: ${role.eligibleBranches.join(", ")}.`
              : null}
          {role.minCgpa !== null && (
            <>
              {" "}
              <strong>Requires CGPA {role.minCgpa.toFixed(1)} or above.</strong>
            </>
          )}
        </p>
      )}

      {/* Drawn as a connected spine rather than a list of boxes. A hiring
          process *is* a sequence, and showing it as one is the clearest thing
          this page can do — you can see how far in a round sits before you
          click it. The connecting line is a CSS pseudo-element, so it needs no
          extra markup and cannot fall out of step with the items. */}
      <ol className="spine">
        {role.rounds.map((round) => {
          // Three states, not two. "Started" is the one worth separating —
          // it is where you left off, and it is the only round you can
          // usefully resume. A round with no questions (a resume screen) is
          // never any of them; it has nothing to be done with.
          const done = round.questionCount > 0 && round.answeredCount === round.questionCount;
          const started = round.answeredCount > 0 && !done;

          return (
            <li key={round.id} className={done ? "is-done" : started ? "is-started" : undefined}>
              <Link to={`/rounds/${round.id}`} className="spine-item">
                <span className="spine-node" aria-hidden="true">
                  {String(round.order).padStart(2, "0")}
                </span>
                <span className="round-body">
                  <span className="tile-title">{round.roundName}</span>
                  {round.notes && <span className="muted small">{round.notes}</span>}
                  <span className="muted small">
                    {round.questionCount === 0
                      ? "No practice questions"
                      : round.answeredCount === 0
                        ? `${round.questionCount} ${round.questionCount === 1 ? "question" : "questions"}`
                        : `${round.answeredCount} of ${round.questionCount} answered`}
                  </span>
                </span>
                <span className={`badge badge-${round.roundType}`}>
                  {ROUND_TYPE_LABELS[round.roundType]}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
