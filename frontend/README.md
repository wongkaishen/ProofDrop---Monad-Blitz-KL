# ProofDrop Frontend

React + Vite + Wagmi UI for the ProofDrop dApp on Monad Testnet.

## Quickstart

```bash
cd frontend
npm install
cp .env.example .env
# fill in VITE_BADGE_CONTRACT and VITE_QUEST_CONTRACT after deploying
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173). Connect MetaMask — the
app will offer to add Monad Testnet (chain id 10143) if it isn't already
configured.

## Flow

1. `GET /quests` from backend
2. User picks quest → uploads proof
3. `POST /submit` returns `{ ok, voucher, signature }`
4. UI calls `claimBadge(voucher, signature)` on `ProofDropBadge`
5. NFT shows up under **My Badges** once the tx confirms.
