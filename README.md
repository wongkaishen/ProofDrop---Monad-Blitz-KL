# ProofDrop

> Complete quests → upload proof → AI verifies → claim NFT badge on Monad.

ProofDrop is a beginner-friendly Web3 app built for **Monad Blitz KL** that
demonstrates a realistic flow combining AI, an on-chain registry, and
user-generated proof:

1. The user picks a quest in a React dApp.
2. They upload text or a photo as **proof**.
3. A Python FastAPI backend runs an **AI/heuristic verification** on the proof.
4. If it passes, the backend signs an **EIP-712 ClaimVoucher**.
5. The frontend submits the voucher to the `ProofDropBadge` ERC-721 contract on
   **Monad Testnet** — the contract checks the signature and mints the badge.

The verifier address embedded in the contract guarantees that *only* proofs
the backend approved can mint a badge, even though the mint transaction is
paid for and submitted by the user.

```
┌────────────┐    proof     ┌──────────────┐  EIP-712 voucher  ┌──────────────┐
│  Frontend  │ ───────────▶ │   Backend    │ ─────────────────▶│  Frontend    │
│ (React +   │              │  (FastAPI +  │                   │              │
│  Wagmi)    │              │   AI check)  │                   │              │
└────┬───────┘              └──────────────┘                   └──────┬───────┘
     │                                                                │
     │  claimBadge(voucher, signature)                                 │
     ▼                                                                 │
┌────────────────────────────────────────────────────────────────────┐ │
│           ProofDropBadge (ERC-721) on Monad Testnet                │◀┘
└────────────────────────────────────────────────────────────────────┘
```

## Repository layout

| Path        | What lives there                                        |
| ----------- | ------------------------------------------------------- |
| `contracts/`| Hardhat project — Solidity contracts, tests, deploy scripts |
| `backend/`  | Python FastAPI service — AI verification + EIP-712 signer |
| `frontend/` | React + Vite + Wagmi dApp                                |

## End-to-end setup

### 0. Prerequisites

- Node.js ≥ 18, npm
- Python ≥ 3.10
- MetaMask (or any injected wallet)
- A funded **Monad Testnet** account (chain id `10143`, RPC `https://testnet-rpc.monad.xyz`)
  — grab MON from the official faucet.

### 1. Generate a backend signer key

The backend needs an Ethereum key it can sign vouchers with. Its address must
match `VERIFIER_ADDRESS` baked into the deployed badge contract.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -c "from eth_account import Account; a=Account.create(); print('PK:', a.key.hex()); print('ADDR:', a.address)"
```

Copy the printed private key into `backend/.env` as `SIGNER_PRIVATE_KEY`,
and the address into `contracts/.env` as `VERIFIER_ADDRESS`.

### 2. Deploy contracts to Monad Testnet

```bash
cd contracts
cp .env.example .env       # add PRIVATE_KEY (deployer) + VERIFIER_ADDRESS
npm install
npx hardhat test           # local sanity check
npm run deploy:monad
npm run seed:monad         # creates 3 starter quests on-chain
```

The deploy script writes `contracts/deployments/monadTestnet.json` containing
the two contract addresses.

### 3. Configure backend & start it

```bash
cd backend
cp .env.example .env
# fill in BADGE_CONTRACT_ADDRESS from contracts/deployments/monadTestnet.json
uvicorn main:app --reload --port 8000
# health check: curl http://localhost:8000/health
```

### 4. Configure frontend & run it

```bash
cd frontend
cp .env.example .env
# fill in VITE_BADGE_CONTRACT and VITE_QUEST_CONTRACT
npm install
npm run dev
```

Open <http://localhost:5173> and connect MetaMask. The wallet will be prompted
to add Monad Testnet automatically.

## Quests in the starter pack

| ID | Name            | Proof    | AI check                                             |
| -- | --------------- | -------- | ---------------------------------------------------- |
| 1  | Hello Monad     | text     | message length + must contain the word "monad"      |
| 2  | Coffee Streak   | image    | image decodes + ≥ 5% warm-coloured pixels (PIL)     |
| 3  | Builder Selfie  | image    | image decodes + ≥ 4% skin-tone pixels (PIL)         |

Swap any verifier for a real model by editing `backend/verifier.py`.

## How the voucher works

Solidity (`ProofDropBadge.sol`) registers an EIP-712 type:

```
ClaimVoucher(address to, uint256 questId, string tokenURI, uint256 deadline)
```

The backend signs that struct with `SIGNER_PRIVATE_KEY`. The contract recovers
the signer from `(voucher, signature)` and only mints when:

- the recovered signer matches the trusted `verifier`,
- `block.timestamp <= deadline`, and
- the recipient has not already claimed this `questId`.

This means the user pays gas to mint their own NFT, but only the backend's
signature can authorise a successful claim.

## Tech stack

- **Solidity 0.8.24**, OpenZeppelin v5 (`ERC721Enumerable`, `ERC721URIStorage`, `EIP712`, `Ownable`)
- **Hardhat** for compile / test / deploy on Monad Testnet
- **FastAPI**, `eth-account`, `Pillow`
- **React 18 + Vite + Wagmi v2 + Viem**
- **Monad Testnet** chain id `10143`

## Built for Monad Blitz KL 2026.
