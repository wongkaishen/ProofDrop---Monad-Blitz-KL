import { useEffect, useMemo, useRef, useState } from "react";

import { tasksApi } from "../api.js";

const PROOF_TYPES = [
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "link", label: "Link" },
];

const CLASS_LABEL = {
  invalid: "Invalid · refine before submitting",
  personal: "Personal Only · streak, no Drop Points",
  qualified: "Qualified · +1 Task Credit",
  high_value: "High Value · +2 Task Credits",
};

/**
 * Modal for creating a new task. Grades live as the user types (debounced)
 * so they see their score climbing the rubric before they commit.
 */
export default function CreateTaskModal({ address, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [proofType, setProofType] = useState("image");
  const [category, setCategory] = useState("general");
  const [grading, setGrading] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const debounceRef = useRef(0);

  const canGrade = useMemo(
    () => title.trim().length >= 3 && description.trim().length >= 3,
    [title, description]
  );

  // Live-grade with 400ms debounce so the score updates as the user types.
  useEffect(() => {
    if (!canGrade) {
      setGrading(null);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      tasksApi
        .grade({ title, description, proof_type: proofType })
        .then((r) => setGrading(r.grading))
        .catch(() => setGrading(null));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [title, description, proofType, canGrade]);

  const onSubmit = async () => {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    if (!canGrade) {
      setError("Title and description must be at least 3 characters.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const t = await tasksApi.create({
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || "general",
        proof_type: proofType,
        created_by: address,
      });
      onCreated?.(t);
    } catch (e) {
      setError(e.message || "Failed to create task.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal create-task" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <header className="modal-head">
          <div>
            <div className="eyebrow">New Task</div>
            <h2>Create a daily task</h2>
            <p className="muted">
              We grade it live against the ProofDrop rubric. Higher score →
              more Task Credits when you submit verified proof.
            </p>
          </div>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              placeholder="e.g. Ship landing page for client X"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
            />
          </label>

          <label className="field">
            <span>What you'll do</span>
            <textarea
              rows={4}
              placeholder="Be specific: numbers, deadline, deliverable, how you'll prove it."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
            />
          </label>

          <div className="row">
            <label className="field">
              <span>Proof type</span>
              <div className="seg">
                {PROOF_TYPES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={"seg-btn " + (proofType === p.id ? "active" : "")}
                    onClick={() => setProofType(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </label>
            <label className="field">
              <span>Category</span>
              <input
                type="text"
                placeholder="e.g. build, study, fitness"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={40}
              />
            </label>
          </div>

          {grading ? (
            <div className={"grading-card cls-" + grading.classification}>
              <div className="grading-head">
                <span className="grading-score">
                  Score · <strong>{grading.total}/12</strong>
                </span>
                <span className="grading-class">
                  {CLASS_LABEL[grading.classification]}
                </span>
              </div>
              <div className="grading-grid">
                <Score n="Specificity"  v={grading.score.specificity}  max={2}/>
                <Score n="Measurability" v={grading.score.measurability} max={2}/>
                <Score n="Effort"        v={grading.score.effort}        max={3}/>
                <Score n="Proof Strength" v={grading.score.proof_strength} max={3}/>
                <Score n="Value"         v={grading.score.value}          max={2}/>
                <Score n="Repeat Risk"   v={grading.score.repeat_risk}   max={0} min={-2}/>
              </div>
              {grading.reasons?.length > 0 && (
                <ul className="grading-reasons">
                  {grading.reasons.slice(0, 3).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="grading-card placeholder muted">
              Type a title and description to see your live grading.
            </div>
          )}

          {error && <div className="alert error inline">{error}</div>}

          <button
            className="btn primary big"
            onClick={onSubmit}
            disabled={submitting || !grading}
          >
            {submitting ? "Creating…" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Score({ n, v, max, min = 0 }) {
  // Render a tiny score chip. Repeat-risk caps at 0 with negative min — show signed.
  return (
    <div className="score-pill">
      <span className="score-name">{n}</span>
      <span className="score-value">{`${v}${max ? "/" + max : ""}`}</span>
      {min < 0 && <span className="score-range">min {min}</span>}
    </div>
  );
}
