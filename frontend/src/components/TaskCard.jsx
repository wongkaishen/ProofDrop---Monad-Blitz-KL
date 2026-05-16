/**
 * Single task card used in the Tasks page list.
 *
 * Surfaces classification + proof type so users understand what reward to
 * expect before they submit.
 */
const CLASS_LABEL = {
  invalid: "Invalid",
  personal: "Personal Only",
  qualified: "Qualified",
  high_value: "High Value",
};

const CLASS_HINT = {
  invalid: "No reward — refine title + description.",
  personal: "Streak only — no Drop Points awarded.",
  qualified: "+1 Task Credit · Leaderboard Eligible",
  high_value: "+2 Task Credits · Leaderboard Eligible",
};

export default function TaskCard({ task, onSubmitClick }) {
  const g = task.grading || {};
  const cls = g.classification || "invalid";
  const reward = g.credits_per_completion || 0;
  const submittable = reward > 0;

  return (
    <article className={"card task-card task-class-" + cls}>
      <div className="task-card-head">
        <span className={"chip cls-" + cls}>{CLASS_LABEL[cls]}</span>
        <span className="chip chip-soft">Proof · {task.proof_type}</span>
      </div>
      <h3 className="task-title">{task.title}</h3>
      <p className="task-desc">{task.description}</p>
      <div className="task-grading">
        <span>Score · {g.total ?? 0}/12</span>
        <span>{CLASS_HINT[cls]}</span>
      </div>
      <div className="task-actions">
        <button
          className={"btn " + (submittable ? "primary" : "ghost")}
          onClick={() => onSubmitClick(task)}
          disabled={!submittable}
          title={submittable ? "" : "This task does not award rewards"}
        >
          {submittable ? "Submit proof →" : "Personal only"}
        </button>
      </div>
    </article>
  );
}
