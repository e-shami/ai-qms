"""Wait-time prediction service.

Bridges the ML predictor to live queue state: derives model inputs
(counter type as service_type, current hour/day, active queue length)
and never raises — falls back per rules.md error-handling baseline.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ml.predictor import predictor
from app.models import Counter, Token, TokenStatus


def active_queue_length(db: Session, counter_id: int) -> int:
    """Tokens still competing for service at this counter (waiting + called)."""
    return int(
        db.execute(
            select(func.count(Token.id)).where(
                Token.counter_id == counter_id,
                Token.status.in_((TokenStatus.WAITING, TokenStatus.CALLED)),
            )
        ).scalar_one()
    )


def estimate_wait_minutes(db: Session, *, institution_id: int, counter: Counter) -> float:
    """Predicted wait in minutes for the next token at `counter`; soft-fails."""
    now = datetime.now(timezone.utc)
    try:
        return predictor.predict(
            institution_id=institution_id,
            counter_id=counter.id,
            service_type=(counter.type or None),
            hour_of_day=now.hour,
            day_of_week=now.weekday(),
            is_weekend=now.weekday() >= 5,
            queue_length_at_arrival=float(active_queue_length(db, counter.id)),
        )
    except Exception:
        return predictor.fallback(now.hour, now.weekday())
