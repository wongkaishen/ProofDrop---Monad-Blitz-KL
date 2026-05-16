"""OpenAI integration for ProofDrop grading + proof verification.

Two callables for the rest of the app:

    llm_grade(title, description, proof_type) -> Grading | None
    llm_verify_proof(task_title, task_description, proof_text, image_bytes)
        -> LLMProofResult | None

Each returns ``None`` if the LLM isn't configured / disabled / fails — the
caller is expected to fall back to the heuristic implementation.

Env:
    OPENAI_API_KEY        — required to enable anything below
    OPENAI_MODEL          — defaults to "gpt-4o-mini"; set to whatever model
                            your key has access to. Must support vision for
                            image proofs.
    LLM_GRADING_ENABLED   — "1" to grade tasks with the LLM, "0" to skip
    LLM_PROOF_ENABLED     — "1" to verify proofs with the LLM, "0" to skip
"""

from __future__ import annotations

import base64
import json
import logging
import os
from dataclasses import dataclass
from typing import Optional

from grading import classify
from models import Grading, GradingScore

log = logging.getLogger("proofdrop.llm")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
_LLM_GRADING_ENABLED = os.environ.get("LLM_GRADING_ENABLED", "1") == "1"
_LLM_PROOF_ENABLED = os.environ.get("LLM_PROOF_ENABLED", "1") == "1"


@dataclass
class LLMProofResult:
    proof_result: str  # "accepted" | "weak" | "rejected" | "suspicious"
    confidence: float
    reasoning: str


# Lazy-import the SDK and lazy-build the client so the backend still works
# when `openai` isn't installed yet (e.g. before `pip install -r requirements.txt`).
_client = None
_client_init_failed = False


def _get_client():
    global _client, _client_init_failed
    if _client is not None or _client_init_failed:
        return _client
    if not OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI
        _client = OpenAI(api_key=OPENAI_API_KEY)
    except Exception as exc:  # noqa: BLE001
        log.warning("OpenAI SDK init failed: %s — falling back to heuristics", exc)
        _client_init_failed = True
    return _client


def is_grading_enabled() -> bool:
    return _LLM_GRADING_ENABLED and _get_client() is not None


def is_proof_enabled() -> bool:
    return _LLM_PROOF_ENABLED and _get_client() is not None


# ---------------------------------------------------------------------------
# Internal: OpenAI chat call with cross-model parameter handling.
# ---------------------------------------------------------------------------
#
# Old chat models (gpt-4o, gpt-4o-mini, gpt-3.5) accept ``max_tokens`` and
# arbitrary ``temperature``. The newer reasoning-class models (o1, o3, gpt-5+)
# reject ``max_tokens`` ("use max_completion_tokens") and lock ``temperature``
# to its default. We detect both and cache the answer per model.
# ---------------------------------------------------------------------------

# Per-model probe cache: which token-limit param works, whether temperature is
# accepted, and whether response_format=json_object is supported.
_model_quirks: dict[str, dict] = {}


def _quirks_for(model: str) -> dict:
    return _model_quirks.setdefault(
        model,
        {
            "token_param": "max_completion_tokens",
            "send_temperature": True,
            "send_json_format": True,
        },
    )


def _chat_json(client, *, messages: list, max_output_tokens: int) -> str:
    """Run a JSON-mode chat completion and return the raw assistant text.

    Adapts to per-model parameter quirks discovered on the first call.
    """
    model = OPENAI_MODEL
    quirks = _quirks_for(model)

    # Try up to a few times, dropping unsupported params as the API rejects them.
    for attempt in range(4):
        kwargs: dict = {
            "model": model,
            "messages": messages,
            quirks["token_param"]: max_output_tokens,
        }
        if quirks["send_temperature"]:
            kwargs["temperature"] = 0.2
        if quirks["send_json_format"]:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            resp = client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content or "{}"
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            # The OpenAI error messages we look for are stable strings.
            if "max_tokens" in msg and "max_completion_tokens" in msg:
                quirks["token_param"] = "max_completion_tokens"
                continue
            if "max_completion_tokens" in msg and "max_tokens" in msg and quirks["token_param"] == "max_completion_tokens":
                quirks["token_param"] = "max_tokens"
                continue
            if "temperature" in msg and "unsupported" in msg.lower():
                quirks["send_temperature"] = False
                continue
            if "response_format" in msg and "unsupported" in msg.lower():
                quirks["send_json_format"] = False
                continue
            # Anything else: re-raise so the outer try/except logs and falls back.
            raise
    # Exhausted retries.
    raise RuntimeError(f"chat completion failed after parameter probing for model {model}")


# ---------------------------------------------------------------------------
# Grading
# ---------------------------------------------------------------------------

_GRADING_SYSTEM = """You are a strict task-grading assistant for ProofDrop, a
productivity rewards platform.

Score the proposed task on the 6-axis ProofDrop rubric. Return ONLY a JSON
object — no preamble, no trailing text:

{
  "specificity": 0..2,
  "measurability": 0..2,
  "effort": 0..3,
  "proof_strength": 0..3,
  "value": 0..2,
  "repeat_risk": -2..0,
  "reasons": ["one short note explaining each axis, plain language"]
}

Guidelines:
- specificity: how concrete and targeted is the task? Vague intentions score 0.
- measurability: are there clear numbers / deliverables / outcomes?
- effort: real, meaningful effort (skill, time, ship/build/study)? Trivial = 0–1.
- proof_strength: derived from proof_type. none=0, text=1, link=2, image=3.
- value: external / lasting value (client work, launch, teaching) high;
  pure leisure 0.
- repeat_risk: NEGATIVE for spammable filler ("nap", "doomscroll", trivial
  daily clicks). Use 0 for healthy non-spammable tasks.

Be honest. Don't inflate. If the description is empty or nonsensical, score
near zero across the board.
"""


def llm_grade(title: str, description: str, proof_type: str) -> Optional[Grading]:
    if not is_grading_enabled():
        return None
    client = _get_client()
    if client is None:
        return None

    user_msg = (
        f"proof_type: {proof_type}\n\n"
        f"Title: {title}\n\n"
        f"Description: {description}"
    )

    try:
        raw = _chat_json(
            client,
            messages=[
                {"role": "system", "content": _GRADING_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            max_output_tokens=400,
        )
        data = json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        log.warning("LLM grading call failed: %s", exc)
        return None

    try:
        score = GradingScore(
            specificity=_clip(int(data.get("specificity", 0)), 0, 2),
            measurability=_clip(int(data.get("measurability", 0)), 0, 2),
            effort=_clip(int(data.get("effort", 0)), 0, 3),
            proof_strength=_clip(int(data.get("proof_strength", 0)), 0, 3),
            value=_clip(int(data.get("value", 0)), 0, 2),
            repeat_risk=_clip(int(data.get("repeat_risk", 0)), -2, 0),
        )
    except (TypeError, ValueError) as exc:
        log.warning("LLM grading returned invalid scores: %s — payload=%s", exc, data)
        return None

    reasons = data.get("reasons", [])
    if isinstance(reasons, str):
        reasons = [reasons]
    if not isinstance(reasons, list):
        reasons = []
    reasons = [str(r) for r in reasons][:6]

    return classify(score, reasons=reasons)


def _clip(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


# ---------------------------------------------------------------------------
# Proof verification
# ---------------------------------------------------------------------------

_PROOF_SYSTEM = """You are a proof-verification assistant for ProofDrop.

A user is claiming they completed a daily task. You will see the task title,
the task description, the user's proof text, and optionally a proof image.
Decide whether the proof plausibly supports the claim.

Reply with ONLY a JSON object:
{
  "proof_result": "accepted" | "weak" | "rejected" | "suspicious",
  "confidence": 0.0..1.0,
  "reasoning": "1–2 short sentences in plain language"
}

Definitions:
- "accepted": clear, on-topic, convincing proof.
- "weak": proof exists but is shallow / generic — counts for streak only.
- "rejected": no usable proof or proof is off-topic.
- "suspicious": looks AI-generated, recycled, or deceptive — flag for review.

When unsure between "accepted" and "rejected", prefer "weak". Be strict but
fair. Brief reasoning only.
"""


def llm_verify_proof(
    *,
    task_title: str,
    task_description: str,
    proof_text: Optional[str],
    image_bytes: Optional[bytes],
    image_mime: str = "image/jpeg",
) -> Optional[LLMProofResult]:
    if not is_proof_enabled():
        return None
    client = _get_client()
    if client is None:
        return None

    user_content: list = [
        {
            "type": "text",
            "text": (
                f"Task title: {task_title}\n"
                f"Task description: {task_description}\n\n"
                f"User's proof text: {proof_text or '(none provided)'}"
            ),
        }
    ]
    if image_bytes:
        b64 = base64.b64encode(image_bytes).decode()
        user_content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{image_mime};base64,{b64}"},
            }
        )

    try:
        raw = _chat_json(
            client,
            messages=[
                {"role": "system", "content": _PROOF_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            max_output_tokens=300,
        )
        data = json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        log.warning("LLM proof verification failed: %s", exc)
        return None

    result = str(data.get("proof_result", "rejected")).lower()
    if result not in ("accepted", "weak", "rejected", "suspicious"):
        result = "rejected"
    try:
        confidence = float(data.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))
    reasoning = str(data.get("reasoning", "")).strip()[:400]

    return LLMProofResult(proof_result=result, confidence=confidence, reasoning=reasoning)
