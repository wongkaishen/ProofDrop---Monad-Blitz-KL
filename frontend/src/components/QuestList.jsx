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
            </div>
            <div className="card-body">
              <h3>{q.title}</h3>
              <p>{q.description}</p>
              <button
                className={"btn " + (done ? "ghost" : "primary")}
                onClick={() => !done && onPickQuest(q)}
                disabled={done}
              >
                {done ? "Badge claimed ✓" : "Submit proof →"}
              </button>
            </div>
          </article>
        );
      })}
      {!quests.length && (
        <div className="card placeholder">Loading quests from backend…</div>
      )}
    </div>
  );
}
