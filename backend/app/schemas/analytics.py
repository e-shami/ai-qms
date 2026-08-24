from datetime import datetime

from pydantic import BaseModel


class HourlyCount(BaseModel):
    hour: int
    count: int


class CounterAnalytics(BaseModel):
    counter_id: int
    counter_name: str
    issued: int
    served: int
    no_shows: int
    declined: int = 0
    waiting: int
    avg_wait_min: float | None = None


class AnalyticsSummary(BaseModel):
    from_at: datetime | None
    to_at: datetime | None
    issued: int
    served: int
    no_shows: int
    declined: int = 0
    waiting_now: int
    in_service_now: int
    abandonment_rate: float | None
    avg_wait_min: float | None
    avg_total_min: float | None
    peak_hour: int | None
    hourly: list[HourlyCount]
    per_counter: list[CounterAnalytics]
