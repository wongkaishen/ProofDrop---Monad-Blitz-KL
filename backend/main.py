"""ProofDrop backend.

Endpoints:
- GET  /health              — readiness probe + signer address
- GET  /quests              — static catalogue mirrored from the on-chain seed
- POST /submit              — multipart form: questId, address, text?, image?
                              runs AI verification, returns a signed voucher
                              the frontend can submit to ProofDropBadge.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Form, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from eth_utils import is_checksum_address, to_checksum_address
from pydantic import BaseModel

from signer import Voucher, sign_voucher, signer_address
from verifier import verify

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("proofdrop")

SIGNER_PRIVATE_KEY = os.environ.get("SIGNER_PRIVATE_KEY", "").strip()
BADGE_CONTRACT_ADDRESS = os.environ.get("BADGE_CONTRACT_ADDRESS", "").strip()
CHAIN_ID = int(os.environ.get("CHAIN_ID", "10143"))
VOUCHER_TTL_SECONDS = int(os.environ.get("VOUCHER_TTL_SECONDS", "900"))
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]

if not SIGNER_PRIVATE_KEY:
    log.warning("SIGNER_PRIVATE_KEY not set — /submit will fail until configured.")

app = FastAPI(title="ProofDrop API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


QUESTS = [
    {
        "id": 1,
        "title": "Hello Monad",
        "description": (
            "Post a short message saying hello to the Monad community. "
            "Include the word 'monad' in your proof text."
        ),
        "kind": "text",
        "badgeImage": "https://api.dicebear.com/9.x/shapes/svg?seed=hello-monad",
    },
    {
        "id": 2,
        "title": "Coffee Streak",
        "description": "Upload a photo of your coffee cup. Our AI checks for a warm-toned image.",
        "kind": "image",
        "badgeImage": "https://api.dicebear.com/9.x/shapes/svg?seed=coffee-streak",
    },
    {
        "id": 3,
        "title": "Builder Selfie",
        "description": "Submit a selfie at your workstation while building on Monad Blitz KL.",
        "kind": "image",
        "badgeImage": "https://api.dicebear.com/9.x/shapes/svg?seed=builder-selfie",
    },
]


class QuestOut(BaseModel):
    id: int
    title: str
    description: str
    kind: str
    badgeImage: str


class SubmitResponse(BaseModel):
    ok: bool
    reason: str
    confidence: float
    voucher: Optional[dict] = None
    signature: Optional[str] = None


@app.get("/health")
def health():
    addr = signer_address(SIGNER_PRIVATE_KEY) if SIGNER_PRIVATE_KEY else None
    return {
        "status": "ok",
        "signer": addr,
        "badgeContract": BADGE_CONTRACT_ADDRESS or None,
        "chainId": CHAIN_ID,
    }


@app.get("/quests", response_model=list[QuestOut])
def list_quests():
    return QUESTS


def _quest(quest_id: int) -> dict:
    for q in QUESTS:
        if q["id"] == quest_id:
            return q
    raise HTTPException(status_code=404, detail=f"Unknown questId {quest_id}")


def _normalise_address(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw.startswith("0x") or len(raw) != 42:
        raise HTTPException(status_code=400, detail="Invalid wallet address")
    try:
        return to_checksum_address(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid address: {exc}") from exc


def _build_token_uri(quest: dict, address: str) -> str:
    """Return a data: URI carrying ERC-721 metadata so we don't need IPFS for the demo."""
    meta = {
        "name": f"ProofDrop · {quest['title']}",
        "description": quest["description"],
        "image": quest["badgeImage"],
        "attributes": [
            {"trait_type": "Quest", "value": quest["title"]},
            {"trait_type": "QuestId", "value": quest["id"]},
            {"trait_type": "Holder", "value": address},
            {"trait_type": "MintedAt", "value": int(time.time())},
        ],
    }
    raw = json.dumps(meta, separators=(",", ":"))
    import base64

    b64 = base64.b64encode(raw.encode()).decode()
    return f"data:application/json;base64,{b64}"


@app.post("/submit", response_model=SubmitResponse)
async def submit(
    questId: int = Form(...),
    address: str = Form(...),
    text: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    if not SIGNER_PRIVATE_KEY:
        raise HTTPException(status_code=500, detail="Backend signer not configured.")
    if not BADGE_CONTRACT_ADDRESS:
        raise HTTPException(status_code=500, detail="BADGE_CONTRACT_ADDRESS not configured.")

    quest = _quest(questId)
    wallet = _normalise_address(address)

    image_bytes: bytes | None = None
    if image is not None:
        image_bytes = await image.read()
        if len(image_bytes) > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Image larger than 5 MB.")

    result = verify(questId, text, image_bytes)
    log.info(
        "verify quest=%s addr=%s ok=%s reason=%s conf=%.2f",
        questId,
        wallet,
        result.ok,
        result.reason,
        result.confidence,
    )
    if not result.ok:
        return SubmitResponse(ok=False, reason=result.reason, confidence=result.confidence)

    token_uri = _build_token_uri(quest, wallet)
    deadline = int(time.time()) + VOUCHER_TTL_SECONDS
    voucher = Voucher(to=wallet, quest_id=questId, token_uri=token_uri, deadline=deadline)
    sig = sign_voucher(
        voucher,
        private_key=SIGNER_PRIVATE_KEY,
        chain_id=CHAIN_ID,
        contract_address=to_checksum_address(BADGE_CONTRACT_ADDRESS),
    )

    return SubmitResponse(
        ok=True,
        reason=result.reason,
        confidence=result.confidence,
        voucher={
            "to": voucher.to,
            "questId": voucher.quest_id,
            "tokenURI": voucher.token_uri,
            "deadline": voucher.deadline,
        },
        signature=sig,
    )
