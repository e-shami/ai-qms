from datetime import datetime

from pydantic import BaseModel

from app.schemas.counter import CounterOut
from app.schemas.token import TokenOut


class CounterQueueStatus(BaseModel):
    counter: CounterOut
    waiting_count: int
    called_count: int
    in_service_count: int
    tokens: list[TokenOut]


class QueueSnapshot(BaseModel):
    institution_id: int
    counter_id: int | None = None
    updated_at: datetime
    counters: list[CounterQueueStatus]