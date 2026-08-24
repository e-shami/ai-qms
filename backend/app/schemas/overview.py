"""Admin monitoring payload — one round-trip for the dashboard screen.

Everything here is derivable from live queue state plus today's token
rows; the endpoint exists so the admin overview needs a single request
instead of stitching /queue and /analytics/summary client-side.
"""
from datetime import datetime

from pydantic import BaseModel

from app.schemas.staff import PresenceEntry
from app.schemas.token import TokenStatus


class LiveFunnel(BaseModel):
    waiting: int
    called: int
    in_service: int


class CounterBoardEntry(BaseModel):
    counter_id: int
    counter_name: str
    counter_type: str | None = None
    is_active: bool
    status: str  # "serving" | "idle" | "closed"
    waiting_count: int
    current_token_number: str | None = None
    current_token_status: TokenStatus | None = None
    served_by_name: str | None = None


class TodayTotals(BaseModel):
    issued: int
    served: int
    no_shows: int
    declined: int
    avg_wait_min: float | None = None


class HourlyPair(BaseModel):
    hour: int
    issued: int
    completed: int


class AdminOverview(BaseModel):
    institution_id: int
    updated_at: datetime
    live: LiveFunnel
    today: TodayTotals
    counters: list[CounterBoardEntry]
    staff: list[PresenceEntry]
    hourly: list[HourlyPair]
