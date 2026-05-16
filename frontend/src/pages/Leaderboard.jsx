import { useEffect, useState } from "react";

import { leaderboardApi } from "../api.js";

export default function Leaderboard({ address }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    leaderboardApi
      .list(25)
      .then((e) => !cancelled && setEntries(e))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="card placeholder">Loading leaderboard…</div>;
  if (error) return <div className="alert error">{error}</div>;

  return (
    <div className="leaderboard">
      <div className="card-list-block">
        <h3>Top builders</h3>
        <p className="muted small">
          Ranked by leaderboard score — only verified qualified and high-value
          tasks count.
        </p>
        {entries.length === 0 ? (
          <div className="card placeholder">
            No leaderboard entries yet. Complete a qualified task to claim the
            top spot.
          </div>
        ) : (
          <ol className="lb-list">
            {entries.map((e) => {
              const me = address && address.toLowerCase() === e.wallet_address.toLowerCase();
              return (
                <li
                  key={e.wallet_address}
                  className={"lb-row " + (me ? "me " : "") + " rank-" + (e.rank <= 3 ? e.rank : "n")}
                >
                  <span className="lb-rank">#{e.rank}</span>
                  <span className="lb-name">
                    {e.display_name}{" "}
                    {me && <span className="chip chip-soft">you</span>}
                  </span>
                  <span className="lb-stat">
                    <strong>{e.leaderboard_score}</strong> score
                  </span>
                  <span className="lb-stat muted">
                    {e.drop_points} Drop Points
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
