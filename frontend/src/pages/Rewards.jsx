import { useEffect, useState } from "react";

import ProgressBar from "../components/ProgressBar.jsx";
import { rewardsApi } from "../api.js";

const CREDITS_PER_DROP_POINT = 5;
const DROP_POINTS_PER_VOUCHER = 10;
const RESTAURANT_VOUCHERS = [
  {
    id: "kopitiam-brunch",
    merchant: "Monad Kopitiam",
    offer: "RM15 Brunch Set",
    detail: "Nasi lemak, kopi, and a reserved builder table.",
    code: "KOPI-MON-15",
  },
  {
    id: "ramen-lab",
    merchant: "Ramen Lab KL",
    offer: "1-for-1 Ramen",
    detail: "Show this demo voucher after 6 PM at the cashier.",
    code: "RAMEN-BUILD-2X",
  },
  {
    id: "taco-node",
    merchant: "Taco Node",
    offer: "Free Taco Combo",
    detail: "Includes one drink. Demo reward for ProofDrop testing.",
    code: "TACO-DROP-01",
  },
];

export default function Rewards({
  address,
  isConnected,
  onConnect,
  refreshKey,
  onActivity,
}) {
  const [snapshot, setSnapshot] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState(null);
  const [redeeming, setRedeeming] = useState(false);
  const [justRedeemed, setJustRedeemed] = useState(null);
  const [claimedRestaurant, setClaimedRestaurant] = useState({});

  const reload = () => {
    if (!isConnected || !address) return;
    Promise.all([rewardsApi.get(address), rewardsApi.dashboard(address)])
      .then(([s, d]) => {
        setSnapshot(s);
        setDashboard(d);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected, refreshKey]);

  useEffect(() => {
    if (!address) {
      setClaimedRestaurant({});
      return;
    }

    const saved = localStorage.getItem(
      `proofdrop.restaurantVouchers.${address.toLowerCase()}`
    );
    setClaimedRestaurant(saved ? JSON.parse(saved) : {});
  }, [address]);

  const redeem = async () => {
    setError(null);
    setRedeeming(true);
    try {
      const res = await rewardsApi.redeem(address);
      setJustRedeemed(res.voucher);
      setSnapshot(res.rewards);
      onActivity?.();
      // re-pull dashboard so vouchers list updates
      const d = await rewardsApi.dashboard(address);
      setDashboard(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setRedeeming(false);
    }
  };

  const claimRestaurantVoucher = (voucher) => {
    if (!address) return;
    const next = {
      ...claimedRestaurant,
      [voucher.id]: voucher.code,
    };
    localStorage.setItem(
      `proofdrop.restaurantVouchers.${address.toLowerCase()}`,
      JSON.stringify(next)
    );
    setClaimedRestaurant(next);
  };

  if (!isConnected) {
    return (
      <div className="card placeholder col">
        <h3>Rewards Locked</h3>
        <p className="muted">Connect your wallet to track Drop Points and redeem vouchers.</p>
        <button className="btn primary" onClick={onConnect}>
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!snapshot || !dashboard) return <div className="card placeholder">Loading…</div>;

  const canRedeem = snapshot.available_points >= DROP_POINTS_PER_VOUCHER;

  return (
    <div className="rewards-page">
      <section className="rewards-summary">
        <div className="rewards-summary-row">
          <div>
            <div className="eyebrow">Available to spend</div>
            <div className="big-num">{snapshot.available_points}</div>
            <div className="muted">Drop Points</div>
          </div>
          <div>
            <div className="eyebrow">Vouchers ready</div>
            <div className="big-num">{snapshot.available_vouchers}</div>
            <div className="muted">10 Drop Points each</div>
          </div>
          <div>
            <div className="eyebrow">Task Credits</div>
            <div className="big-num">{snapshot.qualified_task_credits}</div>
            <div className="muted">5 = 1 Drop Point</div>
          </div>
        </div>
        <button
          className="btn primary big"
          onClick={redeem}
          disabled={!canRedeem || redeeming}
          title={
            canRedeem
              ? ""
              : `Need ${DROP_POINTS_PER_VOUCHER} Drop Points to redeem a Voucher`
          }
        >
          {redeeming ? "Redeeming…" : `Redeem 1 Voucher (${DROP_POINTS_PER_VOUCHER} Drop Points)`}
        </button>
      </section>

      <section className="progress-row">
        <ProgressBar
          color="violet"
          label="Task Credits → next Drop Point"
          value={CREDITS_PER_DROP_POINT - snapshot.credits_to_next_drop_point}
          max={CREDITS_PER_DROP_POINT}
          hint={`5 Task Credits = 1 Drop Point`}
        />
        <ProgressBar
          color="emerald"
          label="Drop Points → next Voucher"
          value={DROP_POINTS_PER_VOUCHER - snapshot.points_to_next_voucher}
          max={DROP_POINTS_PER_VOUCHER}
          hint={`10 Drop Points = 1 Voucher`}
        />
      </section>

      {error && <div className="alert error">{error}</div>}
      {justRedeemed && (
        <div className="alert success">
          Redeemed! Your voucher code: <strong>{justRedeemed.voucher_code}</strong>
        </div>
      )}

      <section className="card-list-block">
        <h3>Restaurant vouchers</h3>
        <p className="muted small">
          Test restaurant rewards for the demo. Click claim to reveal a voucher code.
        </p>
        <div className="restaurant-voucher-grid">
          {RESTAURANT_VOUCHERS.map((voucher) => {
            const claimedCode = claimedRestaurant[voucher.id];
            return (
              <article
                key={voucher.id}
                className={"restaurant-voucher " + (claimedCode ? "claimed" : "")}
              >
                <div>
                  <div className="eyebrow">{voucher.merchant}</div>
                  <h4>{voucher.offer}</h4>
                  <p className="muted small">{voucher.detail}</p>
                </div>
                {claimedCode ? (
                  <div className="claim-receipt">
                    <span>Claimed code</span>
                    <strong>{claimedCode}</strong>
                  </div>
                ) : (
                  <button
                    className="btn primary"
                    onClick={() => claimRestaurantVoucher(voucher)}
                  >
                    Claim Voucher
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="card-list-block">
        <h3>Your vouchers</h3>
        {dashboard.vouchers.length === 0 ? (
          <div className="card placeholder">
            No vouchers yet — redeem one when you have at least 10 Drop Points.
          </div>
        ) : (
          <ul className="voucher-list">
            {dashboard.vouchers.map((v) => (
              <li
                key={v.id}
                className={"voucher " + (v.status === "redeemed" ? "used" : "")}
              >
                <div>
                  <div className="voucher-code">{v.voucher_code}</div>
                  <div className="muted small">
                    {v.status === "redeemed"
                      ? "Used"
                      : `Worth ${v.required_points} Drop Points`}
                  </div>
                </div>
                <span className="muted small">
                  {new Date(v.created_at * 1000).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
