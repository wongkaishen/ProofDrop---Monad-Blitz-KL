"""Pydantic models for ProofDrop tasks / rewards / leaderboard MVP.

These are wire models — what the API accepts and returns. Storage uses
plain dicts (see storage.py) so we stay flexible at the persistence
layer.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ---------- grading ----------

ProofType = Literal["text", "image", "link", "none"]
TaskStatus = Literal["draft", "active", "completed", "expired"]
ProofResult = Literal["accepted", "weak", "rejected", "suspicious"]
Classification = Literal["invalid", "personal", "qualified", "high_value"]


class GradingScore(BaseModel):
    """Raw rubric scores — see grading.py for the rubric definition."""
    specificity: int = Field(..., ge=0, le=2)
    measurability: int = Field(..., ge=0, le=2)
    effort: int = Field(..., ge=0, le=3)
    proof_strength: int = Field(..., ge=0, le=3)
    value: int = Field(..., ge=0, le=2)
    repeat_risk: int = Field(..., ge=-2, le=0)

    @property
    def total(self) -> int:
        return (
            self.specificity
            + self.measurability
            + self.effort
            + self.proof_strength
            + self.value
            + self.repeat_risk
        )


class Grading(BaseModel):
    score: GradingScore
    total: int
    classification: Classification
    credits_per_completion: int
    reward_eligible: bool
    leaderboard_eligible: bool
    reasons: list[str] = Field(default_factory=list)


# ---------- task ----------

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=140)
    description: str = Field(..., min_length=3, max_length=600)
    category: str = Field("general", max_length=40)
    proof_type: ProofType = "text"

    @field_validator("title", "description", "category")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class Task(BaseModel):
    id: str
    title: str
    description: str
    category: str
    proof_type: ProofType
    created_by: str  # wallet address (checksum)
    grading: Grading
    status: TaskStatus
    created_at: int
    updated_at: int


# ---------- submission ----------

class SubmissionCreate(BaseModel):
    user_address: str
    proof_text: Optional[str] = None
    proof_image_hash: Optional[str] = None  # client-computed sha256 of image bytes


class SubmissionResult(BaseModel):
    id: str
    task_id: str
    user_address: str
    proof_result: ProofResult
    task_credits_awarded: int
    leaderboard_points_awarded: int
    drop_points_after: int
    vouchers_after: int
    message: str
    created_at: int


# ---------- user / rewards ----------

class User(BaseModel):
    wallet_address: str
    display_name: str
    total_completed_tasks: int = 0
    qualified_task_credits: int = 0
    reward_points: int = 0      # alias kept for clarity
    drop_points: int = 0
    redeemed_points: int = 0
    available_points: int = 0
    available_vouchers: int = 0
    leaderboard_score: int = 0
    current_streak: int = 0
    last_active_day: Optional[str] = None  # YYYY-MM-DD
    created_at: int
    updated_at: int


class RewardSnapshot(BaseModel):
    wallet_address: str
    qualified_task_credits: int
    drop_points: int
    available_points: int
    redeemed_points: int
    available_vouchers: int
    credits_to_next_drop_point: int  # 5 - (credits % 5)
    points_to_next_voucher: int      # 10 - (drop_points % 10)


class Voucher(BaseModel):
    id: str
    user_address: str
    voucher_code: str
    required_points: int
    status: Literal["available", "redeemed"]
    created_at: int
    redeemed_at: Optional[int] = None


class LeaderboardEntry(BaseModel):
    rank: int
    wallet_address: str
    display_name: str
    leaderboard_score: int
    qualified_task_credits: int
    drop_points: int


# ---------- dashboard ----------

class DashboardResponse(BaseModel):
    user: User
    rewards: RewardSnapshot
    recent_tasks: list[Task]
    recent_submissions: list[SubmissionResult]
    vouchers: list[Voucher]
