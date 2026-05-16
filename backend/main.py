"""ProofDrop backend.

Legacy (on-chain badge) endpoints:
- GET  /health              — readiness probe + signer address
- GET  /quests              — static catalogue mirrored from the on-chain seed
- POST /submit              — runs AI verification, returns a signed voucher
                              the frontend can submit to ProofDropBadge.

Productivity-rewards endpoints (off-chain MVP, see docs in this file):
- POST /tasks/grade
- POST /tasks
- GET  /tasks
- GET  /tasks/{task_id}
- POST /tasks/{task_id}/submit
- GET  /users/{wallet}/rewards
- POST /users/{wallet}/redeem
- GET  /users/{wallet}/dashboard
- GET  /leaderboard
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# Load .env BEFORE the local imports below so modules that read environment
# variables at import-time (notably `llm.py` for OPENAI_API_KEY) see them.
load_dotenv()

from fastapi import FastAPI, Form, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from eth_utils import is_checksum_address, to_checksum_address
from pydantic import BaseModel

from signer import Voucher as BadgeVoucher, sign_voucher, signer_address
from verifier import verify

import abuse
import grading
import llm
import rewards
import storage
from models import (
    DashboardResponse,
    Grading,
    LeaderboardEntry,
    RewardSnapshot,
    SubmissionResult,
    Task,
    TaskCreate,
    User,
    Voucher,
)

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
    addr: Optional[str] = None
    if SIGNER_PRIVATE_KEY:
        try:
            addr = signer_address(SIGNER_PRIVATE_KEY)
        except Exception:  # noqa: BLE001
            # Placeholder / invalid key — don't crash /health.
            addr = None
    return {
        "status": "ok",
        "signer": addr,
        "badgeContract": BADGE_CONTRACT_ADDRESS or None,
        "chainId": CHAIN_ID,
        "llm": {
            "model": llm.OPENAI_MODEL if llm.OPENAI_API_KEY else None,
            "grading_enabled": llm.is_grading_enabled(),
            "proof_enabled": llm.is_proof_enabled(),
        },
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
    badge_voucher = BadgeVoucher(
        to=wallet, quest_id=questId, token_uri=token_uri, deadline=deadline
    )
    sig = sign_voucher(
        badge_voucher,
        private_key=SIGNER_PRIVATE_KEY,
        chain_id=CHAIN_ID,
        contract_address=to_checksum_address(BADGE_CONTRACT_ADDRESS),
    )

    return SubmitResponse(
        ok=True,
        reason=result.reason,
        confidence=result.confidence,
        voucher={
            "to": badge_voucher.to,
            "questId": badge_voucher.quest_id,
            "tokenURI": badge_voucher.token_uri,
            "deadline": badge_voucher.deadline,
        },
        signature=sig,
    )


# ---------------------------------------------------------------------------
# Productivity-rewards platform (off-chain MVP).
# ---------------------------------------------------------------------------
#
# Economy:
#   5 qualified task credits = 1 Drop Point
#   10 Drop Points           = 1 voucher  (50 credits = 1 voucher)
#
# Storage:
#   JSON file via `storage.py`. Each request reads → mutates → writes
#   under a process-level lock; good enough for an MVP single-process
#   FastAPI app.
# ---------------------------------------------------------------------------


def _short_addr(addr: str) -> str:
    return f"{addr[:6]}…{addr[-4:]}"


def _ensure_user(data: dict, wallet: str, *, display_name: Optional[str] = None) -> dict:
    """Create-or-fetch a user record (mutates `data`)."""
    key = wallet.lower()
    users = data["users"]
    user = users.get(key)
    if user is None:
        user = {
            "wallet_address": wallet,
            "display_name": display_name or _short_addr(wallet),
            "total_completed_tasks": 0,
            "qualified_task_credits": 0,
            "reward_points": 0,
            "drop_points": 0,
            "redeemed_points": 0,
            "available_points": 0,
            "available_vouchers": 0,
            "leaderboard_score": 0,
            "current_streak": 0,
            "last_active_day": None,
            "created_at": storage.now(),
            "updated_at": storage.now(),
        }
        users[key] = user
    elif display_name and user.get("display_name", "").startswith("0x"):
        # Upgrade auto-generated short-addr display name once the
        # frontend supplies a real one.
        user["display_name"] = display_name
    return user


def _bump_streak(user: dict) -> None:
    today = abuse.today()
    last = user.get("last_active_day")
    if last == today:
        return
    if last is None:
        user["current_streak"] = 1
    else:
        prev_day = datetime.fromisoformat(last).replace(tzinfo=timezone.utc)
        today_day = datetime.fromisoformat(today).replace(tzinfo=timezone.utc)
        delta_days = (today_day - prev_day).days
        user["current_streak"] = (
            user.get("current_streak", 0) + 1 if delta_days == 1 else 1
        )
    user["last_active_day"] = today


# ---------- task grading ----------

class GradeRequest(BaseModel):
    title: str
    description: str
    proof_type: str = "text"


class GradeResponse(BaseModel):
    grading: Grading


def _grade(title: str, description: str, proof_type: str):
    """Try the LLM grader, fall back to the offline heuristic on any failure."""
    g = llm.llm_grade(title, description, proof_type)
    if g is not None:
        return g
    return grading.auto_grade(title, description, proof_type)  # type: ignore[arg-type]


@app.post("/tasks/grade", response_model=GradeResponse)
def grade_task(req: GradeRequest):
    if req.proof_type not in ("text", "image", "link", "none"):
        raise HTTPException(status_code=400, detail="Invalid proof_type.")
    return GradeResponse(grading=_grade(req.title, req.description, req.proof_type))


# ---------- create task ----------

class CreateTaskRequest(TaskCreate):
    created_by: str
    display_name: Optional[str] = None


@app.post("/tasks", response_model=Task)
def create_task(req: CreateTaskRequest):
    wallet = _normalise_address(req.created_by)
    g = _grade(req.title, req.description, req.proof_type)
    now_ts = storage.now()

    task_holder: dict = {}

    def _mutate(data):
        _ensure_user(data, wallet, display_name=req.display_name)
        task_id = storage.next_id("task", data)
        task = {
            "id": task_id,
            "title": req.title,
            "description": req.description,
            "category": req.category or "general",
            "proof_type": req.proof_type,
            "created_by": wallet,
            "grading": g.model_dump(),
            "status": "active" if g.classification != "invalid" else "draft",
            "created_at": now_ts,
            "updated_at": now_ts,
        }
        data["tasks"][task_id] = task
        task_holder["task"] = task

    storage.write(_mutate)
    return Task(**task_holder["task"])


# ---------- list tasks ----------

@app.get("/tasks", response_model=list[Task])
def list_tasks(userAddress: Optional[str] = None, limit: int = 50):
    data = storage.read()
    tasks = list(data["tasks"].values())
    if userAddress:
        wallet = _normalise_address(userAddress)
        tasks = [t for t in tasks if t.get("created_by", "").lower() == wallet.lower()]
    tasks.sort(key=lambda t: t.get("created_at", 0), reverse=True)
    return [Task(**t) for t in tasks[:limit]]


@app.get("/tasks/{task_id}", response_model=Task)
def get_task(task_id: str):
    data = storage.read()
    task = data["tasks"].get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return Task(**task)


# ---------- submit task proof ----------

@app.post("/tasks/{task_id}/submit", response_model=SubmissionResult)
async def submit_task(
    task_id: str,
    user_address: str = Form(...),
    proof_text: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    wallet = _normalise_address(user_address)

    # Read image bytes (if any) and compute a stable hash for abuse checks.
    image_bytes: Optional[bytes] = None
    image_hash: Optional[str] = None
    if image is not None:
        image_bytes = await image.read()
        if image_bytes:
            if len(image_bytes) > 5 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Image larger than 5 MB.")
            image_hash = hashlib.sha256(image_bytes).hexdigest()

    # Heuristic fallback used when the LLM isn't configured or fails.
    def _heuristic_proof(text: Optional[str], img_present: bool, proof_type: str) -> str:
        if proof_type == "none":
            return "weak"
        if proof_type == "image":
            return "accepted" if img_present else "rejected"
        if proof_type == "link":
            if not text or "http" not in text.lower():
                return "rejected"
            return "accepted"
        # text
        if not text or len(text.strip()) < 5:
            return "rejected"
        if len(text.strip()) < 30:
            return "weak"
        return "accepted"

    data = storage.read()
    task = data["tasks"].get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    # Prefer the LLM (vision-aware) and fall back to the heuristic otherwise.
    proof_reason: Optional[str] = None
    llm_result = llm.llm_verify_proof(
        task_title=task["title"],
        task_description=task["description"],
        proof_text=proof_text,
        image_bytes=image_bytes,
        image_mime=(image.content_type if image is not None else "image/jpeg")
        or "image/jpeg",
    )
    if llm_result is not None:
        proof_result = llm_result.proof_result
        proof_reason = llm_result.reasoning
        log.info(
            "llm proof task=%s user=%s result=%s conf=%.2f",
            task_id, wallet, proof_result, llm_result.confidence,
        )
    else:
        proof_result = _heuristic_proof(proof_text, bool(image_bytes), task["proof_type"])

    if proof_result == "rejected":
        msg = (
            "Proof rejected — please add stronger evidence."
            if not proof_reason
            else f"Proof rejected: {proof_reason}"
        )
        raise HTTPException(status_code=400, detail=msg)

    # Abuse checks (read-only against the latest snapshot).
    err = abuse.check_submission(
        user_address=wallet,
        task_title=task["title"],
        proof_image_hash=image_hash,
        submissions=data["submissions"].values(),
        tasks=data["tasks"],
    )
    if err:
        raise HTTPException(status_code=429, detail=err)

    g = task["grading"]
    base_credits = int(g.get("credits_per_completion", 0))
    leaderboard_eligible = bool(g.get("leaderboard_eligible", False))

    # Proof quality modulates the reward.
    awarded_credits = 0
    awarded_lb_points = 0
    message: str
    if proof_result == "weak":
        message = "Proof accepted as weak — counted for personal streak only."
    elif proof_result == "suspicious":
        message = "Submission flagged as suspicious; no reward issued."
    else:  # accepted
        awarded_credits = base_credits
        if leaderboard_eligible and base_credits > 0:
            awarded_lb_points = max(g.get("total", 0), 0)
        if awarded_credits > 0:
            message = (
                f"Verified ✓ — awarded {awarded_credits} Task Credit"
                + ("s" if awarded_credits > 1 else "")
                + "."
            )
        else:
            message = "Verified — task graded as personal; no Drop Points awarded."
    if proof_reason:
        message = f"{message} {proof_reason}"

    now_ts = storage.now()
    sub_holder: dict = {}

    def _mutate(data):
        user = _ensure_user(data, wallet)
        user["total_completed_tasks"] = user.get("total_completed_tasks", 0) + 1
        _bump_streak(user)
        if awarded_credits > 0:
            rewards.add_credits(user, awarded_credits)
        if awarded_lb_points > 0:
            user["leaderboard_score"] = user.get("leaderboard_score", 0) + awarded_lb_points
        user["updated_at"] = now_ts
        sub_id = storage.next_id("submission", data)
        data["submissions"][sub_id] = {
            "id": sub_id,
            "task_id": task_id,
            "user_address": wallet,
            "proof_text": proof_text,
            "proof_image_hash": image_hash,
            "proof_result": proof_result,
            "task_credits_awarded": awarded_credits,
            "leaderboard_points_awarded": awarded_lb_points,
            "created_at": now_ts,
        }
        sub_holder["id"] = sub_id

    new_state = storage.write(_mutate)
    user_after = new_state["users"][wallet.lower()]
    sub_id = sub_holder["id"]

    return SubmissionResult(
        id=sub_id,
        task_id=task_id,
        user_address=wallet,
        proof_result=proof_result,  # type: ignore[arg-type]
        task_credits_awarded=awarded_credits,
        leaderboard_points_awarded=awarded_lb_points,
        drop_points_after=user_after.get("drop_points", 0),
        vouchers_after=user_after.get("available_vouchers", 0),
        message=message,
        created_at=now_ts,
    )


# ---------- rewards ----------

@app.get("/users/{wallet_address}/rewards", response_model=RewardSnapshot)
def get_rewards(wallet_address: str):
    wallet = _normalise_address(wallet_address)
    data = storage.read()
    user = data["users"].get(wallet.lower())
    if not user:
        user = {
            "wallet_address": wallet,
            "qualified_task_credits": 0,
            "drop_points": 0,
            "redeemed_points": 0,
        }
    return RewardSnapshot(**rewards.recalc_snapshot(user))


class RedeemResponse(BaseModel):
    voucher: Voucher
    rewards: RewardSnapshot


@app.post("/users/{wallet_address}/redeem", response_model=RedeemResponse)
def redeem(wallet_address: str):
    wallet = _normalise_address(wallet_address)

    voucher_out: dict = {}

    def _mutate(data):
        nonlocal voucher_out
        user = _ensure_user(data, wallet)
        try:
            v = rewards.redeem_one_voucher(user, data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        user["updated_at"] = storage.now()
        voucher_out = v

    new_state = storage.write(_mutate)
    user_after = new_state["users"][wallet.lower()]
    snap = rewards.recalc_snapshot(user_after)
    return RedeemResponse(voucher=Voucher(**voucher_out), rewards=RewardSnapshot(**snap))


# ---------- dashboard ----------

@app.get("/users/{wallet_address}/dashboard", response_model=DashboardResponse)
def dashboard(wallet_address: str):
    wallet = _normalise_address(wallet_address)
    data = storage.read()
    user_dict = data["users"].get(wallet.lower())
    if user_dict is None:
        # Return an empty-but-valid dashboard so the UI can render
        # something the first time a wallet connects.
        user_dict = {
            "wallet_address": wallet,
            "display_name": _short_addr(wallet),
            "total_completed_tasks": 0,
            "qualified_task_credits": 0,
            "reward_points": 0,
            "drop_points": 0,
            "redeemed_points": 0,
            "available_points": 0,
            "available_vouchers": 0,
            "leaderboard_score": 0,
            "current_streak": 0,
            "last_active_day": None,
            "created_at": storage.now(),
            "updated_at": storage.now(),
        }

    snap = rewards.recalc_snapshot(user_dict)

    # Recent tasks the user created
    user_tasks = [
        t for t in data["tasks"].values()
        if t.get("created_by", "").lower() == wallet.lower()
    ]
    user_tasks.sort(key=lambda t: t.get("created_at", 0), reverse=True)

    user_subs = [
        s for s in data["submissions"].values()
        if s.get("user_address", "").lower() == wallet.lower()
    ]
    user_subs.sort(key=lambda s: s.get("created_at", 0), reverse=True)

    def _sub_to_result(s: dict) -> SubmissionResult:
        return SubmissionResult(
            id=s["id"],
            task_id=s["task_id"],
            user_address=s["user_address"],
            proof_result=s["proof_result"],
            task_credits_awarded=s["task_credits_awarded"],
            leaderboard_points_awarded=s["leaderboard_points_awarded"],
            drop_points_after=user_dict.get("drop_points", 0),
            vouchers_after=user_dict.get("available_vouchers", 0),
            message="",
            created_at=s["created_at"],
        )

    vouchers = [
        v for v in data["vouchers"].values()
        if v.get("user_address", "").lower() == wallet.lower()
    ]
    vouchers.sort(key=lambda v: v.get("created_at", 0), reverse=True)

    return DashboardResponse(
        user=User(**user_dict),
        rewards=RewardSnapshot(**snap),
        recent_tasks=[Task(**t) for t in user_tasks[:10]],
        recent_submissions=[_sub_to_result(s) for s in user_subs[:10]],
        vouchers=[Voucher(**v) for v in vouchers[:20]],
    )


# ---------- leaderboard ----------

@app.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(limit: int = 25):
    data = storage.read()
    users = [u for u in data["users"].values() if u.get("leaderboard_score", 0) > 0]
    users.sort(key=lambda u: u.get("leaderboard_score", 0), reverse=True)
    out: list[LeaderboardEntry] = []
    for i, u in enumerate(users[:limit], start=1):
        out.append(
            LeaderboardEntry(
                rank=i,
                wallet_address=u["wallet_address"],
                display_name=u.get("display_name") or _short_addr(u["wallet_address"]),
                leaderboard_score=u.get("leaderboard_score", 0),
                qualified_task_credits=u.get("qualified_task_credits", 0),
                drop_points=u.get("drop_points", 0),
            )
        )
    return out
