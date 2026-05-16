import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";

import { BADGE_ABI } from "../abi.js";

const BADGE = import.meta.env.VITE_BADGE_CONTRACT;

function decodeDataUri(uri) {
  try {
    if (uri.startsWith("data:application/json;base64,")) {
      const b64 = uri.slice("data:application/json;base64,".length);
      const json = atob(b64);
      return JSON.parse(json);
    }
    if (uri.startsWith("data:application/json,")) {
      return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length)));
    }
  } catch (_e) {
    /* fall through */
  }
  return null;
}

export default function BadgeGrid({ address }) {
  // Always call all hooks in the same order — even when we have no address
  // or no contract configured — to satisfy the Rules of Hooks. Each hook is
  // gated by `query.enabled` so it stays cheap when inputs are missing.

  const isReady = Boolean(address) && Boolean(BADGE);

  const { data: balance } = useReadContract({
    address: BADGE,
    abi: BADGE_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: isReady },
  });

  const count = balance ? Number(balance) : 0;

  const indexCalls = useMemo(() => {
    if (!isReady || !count) return [];
    return Array.from({ length: count }, (_, i) => ({
      address: BADGE,
      abi: BADGE_ABI,
      functionName: "tokenOfOwnerByIndex",
      args: [address, BigInt(i)],
    }));
  }, [address, count, isReady]);

  const { data: indexData } = useReadContracts({
    contracts: indexCalls,
    allowFailure: true,
    query: { enabled: indexCalls.length > 0 },
  });

  const tokenIds = useMemo(
    () =>
      (indexData ?? [])
        .map((r) => r?.result)
        .filter((x) => x !== undefined && x !== null),
    [indexData]
  );

  const uriCalls = useMemo(
    () =>
      tokenIds.map((id) => ({
        address: BADGE,
        abi: BADGE_ABI,
        functionName: "tokenURI",
        args: [id],
      })),
    [tokenIds]
  );

  const { data: uriData } = useReadContracts({
    contracts: uriCalls,
    allowFailure: true,
    query: { enabled: uriCalls.length > 0 },
  });

  const badges = useMemo(() => {
    if (!uriData) return [];
    return uriData.map((r, i) => {
      const uri = r?.result;
      const meta = uri ? decodeDataUri(uri) : null;
      return { tokenId: tokenIds[i], meta, uri };
    });
  }, [uriData, tokenIds]);

  if (!address) {
    return <div className="card placeholder">Connect a wallet to see your badges.</div>;
  }
  if (!BADGE) {
    return (
      <div className="card placeholder">
        Set <code>VITE_BADGE_CONTRACT</code> in <code>frontend/.env</code> after deploying.
      </div>
    );
  }
  if (count === 0) {
    return (
      <div className="card placeholder">
        No badges yet. Complete a quest to mint your first one.
      </div>
    );
  }

  return (
    <div className="grid">
      {badges.map((b) => (
        <article key={String(b.tokenId)} className="card badge-card">
          <div
            className="badge-art"
            style={{ backgroundImage: `url(${b.meta?.image ?? ""})` }}
          />
          <div className="card-body">
            <div className="eyebrow">Token #{String(b.tokenId)}</div>
            <h3>{b.meta?.name ?? "ProofDrop Badge"}</h3>
            <p>{b.meta?.description ?? "Earned on Monad Testnet."}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
