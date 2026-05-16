import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";

import { BADGE_ABI } from "../abi.js";
import { submitProof } from "../api.js";

const BADGE = import.meta.env.VITE_BADGE_CONTRACT;
const EXPLORER = import.meta.env.VITE_MONAD_EXPLORER ?? "https://testnet.monadexplorer.com";

const STAGES = {
  idle: "idle",
  verifying: "verifying",
  rejected: "rejected",
  voucher: "voucher",
  claiming: "claiming",
  done: "done",
};

export default function ProofModal({ quest, address, onClose }) {
  const [stage, setStage] = useState(STAGES.idle);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState(null);
  const { isLoading: txPending, isSuccess: txSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

  if (txSuccess && stage !== STAGES.done) {
    setStage(STAGES.done);
  }

  const onPickImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImage(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    setErrorMsg(null);
    setStage(STAGES.verifying);
    try {
      const data = await submitProof({
        questId: quest.id,
        address,
        text: text || undefined,
        image: image || undefined,
      });
      setResult(data);
      if (!data.ok) {
        setStage(STAGES.rejected);
        return;
      }
      setStage(STAGES.voucher);
    } catch (e) {
      setErrorMsg(e.message);
      setStage(STAGES.idle);
    }
  };

  const claim = async () => {
    if (!result?.voucher || !result.signature || !BADGE) return;
    setErrorMsg(null);
    setStage(STAGES.claiming);
    try {
      const v = result.voucher;
      const hash = await writeContractAsync({
        address: BADGE,
        abi: BADGE_ABI,
        functionName: "claimBadge",
        args: [
          v.to,
          BigInt(v.questId),
          v.tokenURI,
          BigInt(v.deadline),
          result.signature,
        ],
      });
      setTxHash(hash);
    } catch (e) {
      setErrorMsg(e.shortMessage || e.message);
      setStage(STAGES.voucher);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <header className="modal-head">
          <div className="modal-art" style={{ backgroundImage: `url(${quest.badgeImage})` }} />
          <div>
            <div className="eyebrow">Quest #{quest.id}</div>
            <h2>{quest.title}</h2>
            <p className="muted">{quest.description}</p>
          </div>
        </header>

        <div className="modal-body">
          {stage === STAGES.idle && (
            <Form
              quest={quest}
              text={text}
              setText={setText}
              imagePreview={imagePreview}
              onPickImage={onPickImage}
              onSubmit={submit}
              disabled={
                (quest.kind === "text" && text.trim().length === 0) ||
                (quest.kind === "image" && !image)
              }
              errorMsg={errorMsg}
            />
          )}

          {stage === STAGES.verifying && (
            <StatusBlock title="Verifying your proof…" sub="Our AI is having a look.">
              <Spinner />
            </StatusBlock>
          )}

          {stage === STAGES.rejected && (
            <StatusBlock title="Proof rejected" sub={result?.reason || "Try again with stronger proof."}>
              <div className="confidence">
                Confidence: {(result?.confidence ?? 0).toFixed(2)}
              </div>
              <button className="btn ghost" onClick={() => setStage(STAGES.idle)}>
                Try again
              </button>
            </StatusBlock>
          )}

          {stage === STAGES.voucher && (
            <StatusBlock
              title="Proof verified ✓"
              sub={result?.reason || "Backend signed your claim voucher."}
            >
              <div className="confidence">
                Confidence: {(result?.confidence ?? 0).toFixed(2)}
              </div>
              <button className="btn primary big" onClick={claim}>
                Mint badge on Monad
              </button>
              {errorMsg && <div className="alert error inline">{errorMsg}</div>}
            </StatusBlock>
          )}

          {stage === STAGES.claiming && (
            <StatusBlock
              title={txPending ? "Confirming on Monad…" : "Awaiting wallet approval…"}
              sub={txHash ? `Tx ${txHash.slice(0, 10)}…` : "Sign in your wallet to mint."}
            >
              <Spinner />
              {txHash && (
                <a
                  className="link"
                  href={`${EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on explorer ↗
                </a>
              )}
            </StatusBlock>
          )}

          {stage === STAGES.done && (
            <StatusBlock title="Badge minted 🎉" sub="It's now in your wallet on Monad Testnet.">
              {txHash && (
                <a
                  className="btn primary"
                  href={`${EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction ↗
                </a>
              )}
              <button className="btn ghost" onClick={onClose}>
                Close
              </button>
            </StatusBlock>
          )}
        </div>
      </div>
    </div>
  );
}

function Form({ quest, text, setText, imagePreview, onPickImage, onSubmit, disabled, errorMsg }) {
  return (
    <>
      {quest.kind === "text" ? (
        <label className="field">
          <span>Your proof message</span>
          <textarea
            rows={4}
            placeholder="e.g. Hello Monad! Excited to ship at Monad Blitz KL."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      ) : (
        <label className="field">
          <span>Upload a photo</span>
          <div className="file-drop">
            <input type="file" accept="image/*" onChange={onPickImage} />
            {imagePreview ? (
              <img src={imagePreview} alt="preview" className="preview" />
            ) : (
              <div className="hint">Click to choose · PNG or JPG · up to 5 MB</div>
            )}
          </div>
        </label>
      )}

      {errorMsg && <div className="alert error inline">{errorMsg}</div>}

      <button className="btn primary big" onClick={onSubmit} disabled={disabled}>
        Submit for AI verification
      </button>
    </>
  );
}

function StatusBlock({ title, sub, children }) {
  return (
    <div className="status">
      <h3>{title}</h3>
      <p className="muted">{sub}</p>
      <div className="status-actions">{children}</div>
    </div>
  );
}

function Spinner() {
  return <div className="spinner" aria-label="loading" />;
}
