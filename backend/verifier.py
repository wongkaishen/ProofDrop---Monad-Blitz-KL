"""Heuristic AI verification for ProofDrop submissions.

Each quest has its own check. Real production code would call a vision model
or LLM; for the hackathon we use lightweight rules so the demo runs offline.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Callable

from PIL import Image


@dataclass
class VerificationResult:
    ok: bool
    reason: str
    confidence: float


def _check_hello_monad(text: str | None, image_bytes: bytes | None) -> VerificationResult:
    if not text:
        return VerificationResult(False, "Text proof required for this quest.", 0.0)
    haystack = text.lower()
    if "monad" not in haystack:
        return VerificationResult(False, "Your message must mention 'monad'.", 0.2)
    if len(text.strip()) < 10:
        return VerificationResult(False, "Message is too short — say a bit more!", 0.4)
    return VerificationResult(True, "Looks good. Welcome to Monad!", 0.92)


def _check_image_present(text: str | None, image_bytes: bytes | None) -> VerificationResult:
    if not image_bytes:
        return VerificationResult(False, "Photo upload required for this quest.", 0.0)
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.verify()
    except Exception:
        return VerificationResult(False, "Could not read the uploaded image.", 0.0)
    img = Image.open(io.BytesIO(image_bytes))
    w, h = img.size
    if w < 80 or h < 80:
        return VerificationResult(False, "Image is too small — try a clearer photo.", 0.1)
    return VerificationResult(True, "Image accepted.", 0.8)


def _check_coffee(text: str | None, image_bytes: bytes | None) -> VerificationResult:
    base = _check_image_present(text, image_bytes)
    if not base.ok:
        return base
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((64, 64))
    px = list(img.getdata())
    warm = 0
    for r, g, b in px:
        if r > g and r > b and r > 60 and g < 180 and b < 150:
            warm += 1
    ratio = warm / len(px)
    if ratio < 0.05:
        return VerificationResult(
            False,
            "We couldn't see anything coffee-coloured in your photo.",
            0.3,
        )
    return VerificationResult(True, f"Looks like coffee ({ratio:.0%} warm pixels).", min(0.95, 0.5 + ratio))


def _check_selfie(text: str | None, image_bytes: bytes | None) -> VerificationResult:
    base = _check_image_present(text, image_bytes)
    if not base.ok:
        return base
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((64, 64))
    px = list(img.getdata())
    skin = 0
    for r, g, b in px:
        if r > 95 and g > 40 and b > 20 and r > g and r > b and abs(r - g) > 15:
            skin += 1
    ratio = skin / len(px)
    if ratio < 0.04:
        return VerificationResult(
            False,
            "We couldn't detect a face — make sure you're in the photo.",
            0.3,
        )
    return VerificationResult(True, f"Selfie accepted ({ratio:.0%} skin-toned pixels).", min(0.95, 0.5 + ratio))


# quest_id -> verifier function. Quest IDs match the seed-quests.js order.
VERIFIERS: dict[int, Callable[[str | None, bytes | None], VerificationResult]] = {
    1: _check_hello_monad,
    2: _check_coffee,
    3: _check_selfie,
}


def verify(quest_id: int, text: str | None, image_bytes: bytes | None) -> VerificationResult:
    fn = VERIFIERS.get(quest_id)
    if fn is None:
        return VerificationResult(False, f"No verifier configured for quest {quest_id}.", 0.0)
    return fn(text, image_bytes)
