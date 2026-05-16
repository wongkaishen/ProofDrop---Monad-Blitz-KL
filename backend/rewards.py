"""Drop Points / voucher economics.

The conversion table is intentionally tiny and lives in one place so
business can tweak the numbers later:

    CREDITS_PER_DROP_POINT  = 5    (5 verified-qualified task credits = 1 Drop Point)
    DROP_POINTS_PER_VOUCHER = 10   (10 Drop Points = 1 voucher)
    CREDITS_PER_VOUCHER     = 50   (derived)
"""

from __future__ import annotations

import secrets
from typing import Any

from storage import next_id, now

CREDITS_PER_DROP_POINT = 5
DROP_POINTS_PER_VOUCHER = 10
CREDITS_PER_VOUCHER = CREDITS_PER_DROP_POINT * DROP_POINTS_PER_VOUCHER  # 50


def add_credits(user: dict[str, Any], credits: int) -> tuple[int, int]:
    """Mutate user dict to add `credits`, promoting whole groups of
    5 credits into Drop Points and 10 Drop Points into vouchers.

    Returns (new_drop_points_total, new_available_vouchers_total).
    """
    if credits <= 0:
        return user["drop_points"], user["available_vouchers"]

    user["qualified_task_credits"] = user.get("qualified_task_credits", 0) + credits

    # Promote credits → drop points whenever we have ≥5.
    earned_points = user["qualified_task_credits"] // CREDITS_PER_DROP_POINT
    consumed_credits = earned_points * CREDITS_PER_DROP_POINT
    if earned_points:
        user["qualified_task_credits"] -= consumed_credits
        user["drop_points"] = user.get("drop_points", 0) + earned_points
        user["reward_points"] = user["drop_points"]  # keep alias in sync

    # Promote points → vouchers whenever we have ≥10 *available* points.
    available = user["drop_points"] - user.get("redeemed_points", 0)
    new_vouchers = available // DROP_POINTS_PER_VOUCHER
    user["available_points"] = available
    user["available_vouchers"] = new_vouchers

    return user["drop_points"], user["available_vouchers"]


def recalc_snapshot(user: dict[str, Any]) -> dict[str, Any]:
    """Recompute the derived fields a caller wants in a snapshot."""
    credits = user.get("qualified_task_credits", 0)
    drop_points = user.get("drop_points", 0)
    redeemed = user.get("redeemed_points", 0)
    available = drop_points - redeemed
    return {
        "wallet_address": user["wallet_address"],
        "qualified_task_credits": credits,
        "drop_points": drop_points,
        "available_points": available,
        "redeemed_points": redeemed,
        "available_vouchers": available // DROP_POINTS_PER_VOUCHER,
        "credits_to_next_drop_point": (
            CREDITS_PER_DROP_POINT - (credits % CREDITS_PER_DROP_POINT)
        ) % CREDITS_PER_DROP_POINT or CREDITS_PER_DROP_POINT,
        "points_to_next_voucher": (
            DROP_POINTS_PER_VOUCHER - (available % DROP_POINTS_PER_VOUCHER)
        ) % DROP_POINTS_PER_VOUCHER or DROP_POINTS_PER_VOUCHER,
    }


def make_voucher_code() -> str:
    """Short, human-friendly code: 4-4-4 alphanumeric."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    parts = []
    for _ in range(3):
        parts.append("".join(secrets.choice(alphabet) for _ in range(4)))
    return "PD-" + "-".join(parts)


def redeem_one_voucher(
    user: dict[str, Any],
    data: dict[str, Any],
) -> dict[str, Any]:
    """Spend 10 Drop Points → create one voucher.

    Mutates `user` and `data` in place. Must be called inside a
    ``storage.write(mutator)`` block — the surrounding write persists
    both the user changes and the new voucher / sequence number.
    """
    available = user.get("drop_points", 0) - user.get("redeemed_points", 0)
    if available < DROP_POINTS_PER_VOUCHER:
        raise ValueError(
            f"Need {DROP_POINTS_PER_VOUCHER} available Drop Points; "
            f"user has {available}."
        )

    user["redeemed_points"] = user.get("redeemed_points", 0) + DROP_POINTS_PER_VOUCHER
    user["available_points"] = (
        user.get("drop_points", 0) - user["redeemed_points"]
    )
    user["available_vouchers"] = user["available_points"] // DROP_POINTS_PER_VOUCHER

    vid = next_id("voucher", data)
    voucher = {
        "id": vid,
        "user_address": user["wallet_address"],
        "voucher_code": make_voucher_code(),
        "required_points": DROP_POINTS_PER_VOUCHER,
        "status": "available",
        "created_at": now(),
        "redeemed_at": None,
    }
    data["vouchers"][vid] = voucher
    return voucher
