# ProofDrop Backend

FastAPI service that verifies user proofs and signs EIP-712 vouchers the
`ProofDropBadge` contract accepts as authorisation to mint.

## Quickstart

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env: set SIGNER_PRIVATE_KEY, then deploy contracts using the address
# this key derives (see /health endpoint) as VERIFIER_ADDRESS.
uvicorn main:app --reload --port 8000
```

## Endpoints

- `GET /health` — sanity check; returns the signer address. Deploy the badge
  contract with that address as the verifier.
- `GET /quests` — quest catalogue.
- `POST /submit` — multipart form with `questId`, `address`, optional `text`
  and `image`. Returns `{ ok, voucher, signature }` on success.

## Generating a fresh signer

```python
from eth_account import Account
acct = Account.create()
print(acct.key.hex(), acct.address)
```
