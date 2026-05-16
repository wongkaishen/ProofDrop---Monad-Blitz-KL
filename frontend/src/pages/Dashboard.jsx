import { useEffect, useState } from "react";

import ProgressBar from "../components/ProgressBar.jsx";
import { rewardsApi } from "../api.js";

const CREDITS_PER_DROP_POINT = 5;
const DROP_POINTS_PER_VOUCHER = 10;

export default function Dashboard({
  address,
  isConnected,
  onConnect,
  refreshKey,
  onGoToTasks,
  onGoToRewards,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    rewardsApi
      .dashboard(address)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [address, isConnected, refreshKey]);

  if (!isConnected) {
    return (
      <div className="card placeholder col">
        <h3>Welcome to ProofDrop</h3>
        <p className="muted">
          Connect a wallet to start creating daily tasks, earning Task Credits,
          and redeeming Vouchers.
        </p>
        <button className="btn primary" onClick={onConnect}>
          Connect Wallet
        </button>
      </div>
    );
  }

  if (loading && !data) return <div className="card placeholder">Loading dashboard…</div>;
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;

  const r = data.rewards;
  const u = data.user;

  return (
    <div className="dashboard">
      <section className="stats-grid">
        <StatCard label="Verified Tasks" value={u.total_completed_tasks} />
        <StatCard label="Task Credits" value={r.qualified_task_credits} />
        <StatCard label="Drop Points" value={r.available_points} accent="success" />
        <StatCard label="Vouchers Ready" value={r.available_vouchers} accent="violet" />
        <StatCard label="Streak" value={`${u.current_streak} 🔥`} />
        <StatCard label="Leaderboard Score" value={u.leaderboard_score} />
      </section>

      <section className="progress-row">
        <ProgressBar
          color="violet"
          label="Task Credits → next Drop Point"
          value={CREDITS_PER_DROP_POINT - r.credits_to_next_drop_point}
          max={CREDITS_PER_DROP_POINT}
          hint={`${r.credits_to_next_drop_point} more credit${
            r.credits_to_next_drop_point === 1 ? "" : "s"
          } to earn 1 Drop Point`}
        />
        <ProgressBar
          color="emerald"
          label="Drop Points → next Voucher"
          value={DROP_POINTS_PER_VOUCHER - r.points_to_next_voucher}
          max={DROP_POINTS_PER_VOUCHER}
          hint={`${r.points_to_next_voucher} more Drop Point${
            r.points_to_next_voucher === 1 ? "" : "s"
          } to redeem 1 Voucher`}
        />
      </section>

      <section className="dash-cta-row">
        <button className="btn primary" onClick={onGoToTasks}>
          Create a task
        </button>
        <button className="btn ghost" onClick={onGoToRewards}>
          Manage rewards
        </button>
      </section>

      <section className="card-list-block">
        <h3>Recent tasks</h3>
        {data.recent_tasks.length === 0 ? (
          <div className="card placeholder">
            You haven't created any tasks yet — head to Tasks to start.
          </div>
        ) : (
          <ul className="row-list">
            {data.recent_tasks.map((t) => (
              <li key={t.id} className="row-item">
                <div>
                  <div className="row-title">{t.title}</div>
                  <div className="muted small">
                    {t.category} · proof: {t.proof_type} · score{" "}
                    {t.grading.total}/12
                  </div>
                </div>
                <span className={"chip cls-" + t.grading.classification}>
                  {t.grading.classification.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-list-block">
        <h3>Recent submissions</h3>
        {data.recent_submissions.length === 0 ? (
          <div className="card placeholder">No submissions yet.</div>
        ) : (
          <ul className="row-list">
            {data.recent_submissions.map((s) => (
              <li key={s.id} className="row-item">
                <div>
                  <div className="row-title">
                    {s.task_credits_awarded > 0
                      ? `+${s.task_credits_awarded} Task Credit${
                          s.task_credits_awarded > 1 ? "s" : ""
                        }`
                      : "No credits"}
                  </div>
                  <div className="muted small">
                    Proof · {s.proof_result} · leaderboard +
                    {s.leaderboard_points_awarded}
                  </div>
                </div>
                <span className="muted small">
                  {new Date(s.created_at * 1000).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className={"stat-card " + (accent || "")}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
