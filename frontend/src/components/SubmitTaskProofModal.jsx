import { useState } from "react";

import { tasksApi } from "../api.js";

/**
 * Submit-proof flow for productivity tasks (NOT the on-chain badge quest).
 *
 * Stages: idle → submitting → done | error
 */
export default function SubmitTaskProofModal({ task, address, onClose, onDone }) {
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [stage, setStage] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const proofType = task.proof_type;

  const onPickImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImage(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const canSubmit =
    !!address &&
    ((proofType === "image" && image) ||
      (proofType === "text" && text.trim().length >= 5) ||
      (proofType === "link" && /https?:\/\//i.test(text)) ||
      proofType === "none");

  const submit = async () => {
    setError(null);
    setStage("submitting");
    try {
      const r = await tasksApi.submitProof({
        taskId: task.id,
        userAddress: address,
        proofText: text || undefined,
        image: image || undefined,
      });
      setResult(r);
      setStage("done");
      onDone?.(r);
    } catch (e) {
      setError(e.message || "Submission failed.");
      setStage("idle");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <header className="modal-head">
          <div>
            <div className="eyebrow">Submit Proof</div>
            <h2>{task.title}</h2>
            <p className="muted">{task.description}</p>
          </div>
        </header>

        <div className="modal-body">
          {stage === "done" && result ? (
            <div className="status">
              <h3>
                {result.task_credits_awarded > 0
                  ? "Verified ✓"
                  : "Submission recorded"}
              </h3>
              <p className="muted">{result.message}</p>
              <div className="status-actions">
                <div className="reward-pills">
                  <div className="reward-pill">
                    <span>Task Credits</span>
                    <strong>+{result.task_credits_awarded}</strong>
                  </div>
                  <div className="reward-pill">
                    <span>Drop Points</span>
                    <strong>{result.drop_points_after}</strong>
                  </div>
                  <div className="reward-pill">
                    <span>Vouchers</span>
                    <strong>{result.vouchers_after}</strong>
                  </div>
                </div>
                <button className="btn primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {proofType !== "image" && (
                <label className="field">
                  <span>
                    {proofType === "link" ? "Proof link (https://…)" : "Proof message"}
                  </span>
                  <textarea
                    rows={3}
                    placeholder={
                      proofType === "link"
                        ? "https://your-proof-url"
                        : "Describe what you did — be specific."
                    }
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
              )}

              {proofType !== "text" && (
                <label className="field">
                  <span>
                    {proofType === "image"
                      ? "Proof image (required)"
                      : "Optional supporting image"}
                  </span>
                  <div className="file-drop">
                    <input type="file" accept="image/*" onChange={onPickImage} />
                    {imagePreview ? (
                      <img src={imagePreview} alt="preview" className="preview" />
                    ) : (
                      <div className="hint">Click to choose · PNG/JPG · up to 5 MB</div>
                    )}
                  </div>
                </label>
              )}

              {error && <div className="alert error inline">{error}</div>}

              <button
                className="btn primary big"
                onClick={submit}
                disabled={!canSubmit || stage === "submitting"}
              >
                {stage === "submitting" ? "Verifying…" : "Submit for verification"}
              </button>

              <div className="muted small center">
                Reward depends on proof quality. Image proofs verify the
                strongest; text proofs are weakest.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
