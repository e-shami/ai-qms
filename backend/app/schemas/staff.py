"""Staff self-service schemas: presence, counter claims, and the
single-payload workspace view that backs the staff home screen."""
from datetime import datetime

from pydantic import BaseModel

from app.schemas.counter import CounterOut
from app.schemas.queue import CounterQueueStatus
from app.schemas.token import TokenStatus

WORK_STATUSES = ("off_duty", "available", "on_break")


class WorkStatusUpdate(BaseModel):
    work_status: str


class CounterClaim(BaseModel):
    counter_id: int


class PresenceEntry(BaseModel):
    personnel_id: int
    name: str
    title: str | None = None
    work_status: str
    counter_id: int | None = None
    serving_token_number: str | None = None
    serving_token_status: TokenStatus | None = None


class StaffToday(BaseModel):
    served_by_me: int
    no_shows_by_me: int
    declined_by_me: int
    avg_service_min: float | None = None


class StaffWorkspace(BaseModel):
    personnel_id: int
    name: str
    title: str | None
    work_status: str
    counter: CounterOut | None = None
    queue: CounterQueueStatus | None = None
    today: StaffToday
    updated_at: datetime
