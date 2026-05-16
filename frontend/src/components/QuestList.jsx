import { useAccount, useReadContracts } from "wagmi";
import { BADGE_ABI } from "../abi.js";

const BADGE = import.meta.env.VITE_BADGE_CONTRACT;

export default function QuestList({ quests, onPickQuest }) {
  const { address } = useAccount();

  const { data: claimedFlags } = useReadContracts({
    allowFailure: true,
    contracts:
      address && quests.length && BADGE
        ? quests.map((q) => ({
            address: BADGE,
            abi: BADGE_ABI,
            functionName: "claimed",
            args: [BigInt(q.id), address],
          }))
        : [],
    query: { enabled: Boolean(address && quests.length && BADGE) },
  });

  return (
    <div className="grid">
      {quests.map((q, i) => {
        const done = claimedFlags?.[i]?.result === true;
        return (
          <article key={q.id} className={"card quest " + (done ? "done" : "")}>
            <div className="quest-art" style={{ backgroundImage: `url(${q.badgeImage})` }}>
              <span className={"quest-kind " + q.kind}>{q.kind}</span>
              {done && <span className="claimed-stamp">Claimed</span>}
            </div>
            <div className="card-body">
              <div className="quest-meta">
                <span>Quest #{q.id}</span>
                <span>{q.kind === "image" ? "Photo proof" : "Text proof"}</span>
              </div>
              <h3>{q.title}</h3>
              <p>{q.description}</p>
              <div className="card-action">
                <button
                  className={"btn " + (done ? "ghost" : "primary")}
                  onClick={() => !done && onPickQuest(q)}
                  disabled={done}
                >
                  {done ? "Badge claimed" : "Submit proof"}
                </button>
              </div>
            </div>
          </article>
        );
      })}
      {!quests.length && (
        <>
          {[0, 1, 2].map((i) => (
            <div className="card quest skeleton" key={i} aria-label="Loading quest">
              <div className="quest-art" />
              <div className="card-body">
                <div className="skeleton-line short" />
                <div className="skeleton-line" />
                <div className="skeleton-line mid" />
                <div className="skeleton-button" />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
