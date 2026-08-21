"""Wait-time estimation service.

Layered estimator, most-trusted-source-first:

1. Empirical — the institution's own measured average service time
   (completed_at − called_at over recent served tokens) × people ahead.
   This is real local data and beats any global model for the tenant.
2. Heuristic cold start — before enough local history exists,
   people ahead × a configurable default service time.

The global ML predictor (ml/predictor.py) is exposed alongside as
`ml_estimate_min` for transparency and Phase 9 evaluation; it is NOT
used for live numbers because brand-new institution/counter IDs are
out-of-distribution for it (numeric ID features trained on other
tenants) — see memory.md Phase 5 note. Never raises.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
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


def institution_service_rate(db: Session, institution_id: int) -> float | None:
    """Mean service duration (minutes) from this institution's own served
    tokens (most recent 200). None until PREDICT_MIN_SERVICE_SAMPLES exist."""
    rows = db.execute(
        select(Token.called_at, Token.completed_at)
        .where(
            Token.institution_id == institution_id,
            Token.status == TokenStatus.SERVED,
            Token.called_at.is_not(None),
            Token.completed_at.is_not(None),
        )
        .order_by(Token.completed_at.desc())
        .limit(200)
    ).all()
    durations = [
        (completed - called).total_seconds() / 60.0
        for called, completed in rows
        if completed > called
    ]
    if len(durations) < settings.PREDICT_MIN_SERVICE_SAMPLES:
        return None
    return sum(durations) / len(durations)


def ml_estimate_minutes(db: Session, *, institution_id: int, counter: Counter) -> float:
    """Raw global-model estimate, kept for comparison/evaluation only."""
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


def estimate_wait_minutes(
    db: Session,
    *,
    institution_id: int,
    counter: Counter,
    people_ahead: int | None = None,
) -> tuple[float, str]:
    """Estimated wait in minutes for the next token at `counter`, plus the
    method used ("empirical" or "heuristic"). Soft-fails to the heuristic."""
    try:
        if people_ahead is None:
            people_ahead = active_queue_length(db, counter.id)

        rate = institution_service_rate(db, institution_id)
        if rate is not None:
            return round(people_ahead * rate, 1), "empirical"

        return (
            round(people_ahead * settings.PREDICT_DEFAULT_SERVICE_MIN, 1),
            "heuristic",
        )
    except Exception:
        return round(max(0, people_ahead or 0) * settings.PREDICT_DEFAULT_SERVICE_MIN, 1), "heuristic"
