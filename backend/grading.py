"""Task grading rubric + auto-grading heuristic.

Two ways to use this module:

1. Caller passes raw scores (when a human / AI rubric has already
   evaluated the task). `classify(score)` turns them into a Grading.
2. Caller passes just a title + description and lets `auto_grade()`
   produce a best-effort heuristic grading.

Either way the rubric and classification thresholds live here, in one
place.

Rubric (total 12):
    specificity   0–2
    measurability 0–2
    effort        0–3
    proof_strength 0–3
    value         0–2
    repeat_risk  -2–0

Classification:
    0–4  invalid     — no credits, not on leaderboard
    5–7  personal    — streak only, no credits, no leaderboard
    8–10 qualified   — 1 credit, reward + leaderboard
    11–12 high_value — 2 credits, reward + leaderboard
"""

from __future__ import annotations

import re
from typing import Iterable

from models import (
    Classification,
    Grading,
    GradingScore,
    ProofType,
)


# ---------- classification table ----------

_NUMBER_RE = re.compile(r"\b\d+(?:\.\d+)?\b")
_MEASURE_HINTS = (
    "min", "minute", "hour", "second", "rep", "set", "page", "word", "km",
    "kilometer", "mile", "step", "calorie", "kcal", "ml", "liter", "litre",
    "%", "percent", "task", "line", "lesson", "chapter", "exercise",
)
_EFFORT_HEAVY_HINTS = (
    "code", "study", "workout", "deploy", "ship", "build", "design",
    "write", "publish", "research", "review", "interview", "lift",
    "run", "marathon", "draft", "refactor",
)
_VALUE_HINTS = (
    "client", "customer", "ship", "publish", "launch", "open source",
    "donate", "volunteer", "interview", "teach", "demo",
)
_WEAK_HINTS = ("nap", "scroll", "doomscroll", "snack", "chill", "watch tv")


def classify(score: GradingScore, reasons: Iterable[str] | None = None) -> Grading:
    """Apply the threshold table to a raw rubric score."""
    total = score.total
    if total <= 4:
        cls: Classification = "invalid"
        credits = 0
        reward, lb = False, False
    elif total <= 7:
        cls = "personal"
        credits = 0
        reward, lb = False, False
    elif total <= 10:
        cls = "qualified"
        credits = 1
        reward, lb = True, True
    else:
        cls = "high_value"
        credits = 2
        reward, lb = True, True

    return Grading(
        score=score,
        total=total,
        classification=cls,
        credits_per_completion=credits,
        reward_eligible=reward,
        leaderboard_eligible=lb,
        reasons=list(reasons or []),
    )


# ---------- auto-grading ----------

def _score_specificity(title: str, description: str) -> tuple[int, str]:
    text = f"{title} {description}".lower()
    words = len(text.split())
    if words < 6:
        return 0, "Very short description — be more specific."
    if words < 18:
        return 1, "Some detail but could be more specific."
    return 2, "Specific enough."


def _score_measurability(text: str) -> tuple[int, str]:
    has_number = bool(_NUMBER_RE.search(text))
    has_hint = any(h in text for h in _MEASURE_HINTS)
    if has_number and has_hint:
        return 2, "Clear measurable target."
    if has_number or has_hint:
        return 1, "Partially measurable."
    return 0, "No measurable outcome found."


def _score_effort(text: str) -> tuple[int, str]:
    hits = sum(1 for h in _EFFORT_HEAVY_HINTS if h in text)
    if hits >= 2:
        return 3, "Looks like real effort."
    if hits == 1:
        return 2, "Modest effort."
    if len(text.split()) >= 12:
        return 1, "Some effort implied."
    return 0, "Effort unclear."


def _score_proof_strength(proof_type: ProofType) -> tuple[int, str]:
    table: dict[ProofType, tuple[int, str]] = {
        "none": (0, "No proof required → weak."),
        "text": (1, "Text proof is the weakest verifiable form."),
        "link": (2, "Link proof is verifiable."),
        "image": (3, "Image proof is the strongest available."),
    }
    return table[proof_type]


def _score_value(text: str) -> tuple[int, str]:
    if any(h in text for h in _VALUE_HINTS):
        return 2, "Creates external / lasting value."
    if "learn" in text or "skill" in text:
        return 1, "Personal growth value."
    return 0, "No clear external value."


def _score_repeat_risk(title: str) -> tuple[int, str]:
    t = title.lower().strip()
    if any(h in t for h in _WEAK_HINTS):
        return -2, "Title hints at low-effort / repeatable activity."
    if len(t) < 12:
        return -1, "Very short title — easy to spam."
    return 0, "No obvious repeat-risk."


def auto_grade(title: str, description: str, proof_type: ProofType) -> Grading:
    """Heuristic grader used when no rubric scores are supplied.

    Deterministic, language-agnostic enough for an MVP. Swap for an LLM
    call later by replacing this function — `classify()` doesn't change.
    """
    text = f"{title}\n{description}".lower()

    spec, r1 = _score_specificity(title, description)
    meas, r2 = _score_measurability(text)
    eff, r3 = _score_effort(text)
    proof, r4 = _score_proof_strength(proof_type)
    val, r5 = _score_value(text)
    risk, r6 = _score_repeat_risk(title)

    score = GradingScore(
        specificity=spec,
        measurability=meas,
        effort=eff,
        proof_strength=proof,
        value=val,
        repeat_risk=risk,
    )
    return classify(score, reasons=[r1, r2, r3, r4, r5, r6])
