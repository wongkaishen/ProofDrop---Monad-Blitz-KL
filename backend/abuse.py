"""Anti-abuse checks for task submissions.

Rules implemented:
  1. Max 5 reward-eligible submissions per user per day.
  2. Same task title cannot be submitted twice on the same day.
  3. Same proof image hash cannot be reused (any user, any day).
  4. Invalid + personal-only tasks do not generate Drop Points
     (enforced upstream via grading.credits_per_completion = 0).
  5. Leaderboard only counts qualified / high_value tasks
     (enforced upstream via grading.leaderboard_eligible).
  6. Sponsored tasks require stronger proof — out of scope for MVP
     (placeholder hook left below).
  7. Voucher redemption requires ≥10 available Drop Points
     (enforced in rewards.redeem_one_voucher).
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Iterable

MAX_REWARD_SUBMISSIONS_PER_DAY = 5


def _day_str(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


def today() -> str:
    return _day_str(int(time.time()))


def check_submission(
    *,
    user_address: str,
    task_title: str,
    proof_image_hash: str | None,
    submissions: Iterable[dict[str, Any]],
    tasks: dict[str, Any],
) -> str | None:
    """Return an error string if the submission should be blocked, else None."""
    today_str = today()
    same_day_rewarded = 0
    submissions = list(submissions)

    if proof_image_hash:
        for s in submissions:
            if s.get("proof_image_hash") == proof_image_hash:
                return "This proof image has already been used."

    for s in submissions:
        if s.get("user_address", "").lower() != user_address.lower():
            continue
        sub_day = _day_str(s.get("created_at", 0))
        if sub_day != today_str:
            continue

        # Rule 2: same title same day
        task = tasks.get(s.get("task_id"))
        if task and task.get("title", "").strip().lower() == task_title.strip().lower():
            return "You already submitted this task today."

        # Rule 1: count rewardable submissions today
        if s.get("task_credits_awarded", 0) > 0:
            same_day_rewarded += 1

    if same_day_rewarded >= MAX_REWARD_SUBMISSIONS_PER_DAY:
        return (
            f"Daily limit reached: {MAX_REWARD_SUBMISSIONS_PER_DAY} "
            "reward-eligible submissions per day."
        )

    return None
