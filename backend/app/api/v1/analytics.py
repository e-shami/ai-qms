"""Server-side analytics aggregation.

The frontend previously computed KPIs by fetching the full token
history — replaced by this endpoint. `from`/`to` are ISO datetimes;
the client converts its local day boundaries, keeping hour-of-day
histograms timezone-correct via `tz_offset_minutes` (default UTC).
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models import Counter, Token, TokenStatus, User
from app.schemas.analytics import AnalyticsSummary, CounterAnalytics, HourlyCount
from app.services.queue_service import NON_TERMINAL_STATUSES

router = APIRouter(prefix="/analytics", tags=["analytics"])

MAX_RANGE_DAYS = 366


def _minutes(start: datetime, end: datetime) -> float:
    return (end - start).total_seconds() / 60.0


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


@router.get("/summary", response_model=AnalyticsSummary)
def analytics_summary(
    from_at: datetime | None = Query(default=None, alias="from"),
    to_at: datetime | None = Query(default=None, alias="to"),
    tz_offset_minutes: int = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyticsSummary:
    if from_at is not None and to_at is not None and to_at <= from_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'to' must be after 'from'",
        )
    if (
        from_at is not None
        and to_at is not None
        and (to_at - from_at) > timedelta(days=MAX_RANGE_DAYS)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Range exceeds {MAX_RANGE_DAYS} days",
        )

    query = select(Token).where(Token.institution_id == user.institution_id)
    if from_at is not None:
        query = query.where(Token.issued_at >= from_at)
    if to_at is not None:
        query = query.where(Token.issued_at < to_at)
    tokens = db.execute(query.order_by(Token.issued_at)).scalars().all()

    issued = len(tokens)
    served = sum(1 for t in tokens if t.status == TokenStatus.SERVED)
    no_shows = sum(1 for t in tokens if t.status == TokenStatus.NO_SHOW)
    resolved = served + no_shows

    waits = [
        _minutes(t.issued_at, t.called_at) for t in tokens if t.called_at is not None
    ]
    totals = [
        _minutes(t.issued_at, t.completed_at)
        for t in tokens
        if t.completed_at is not None
    ]

    offset = timedelta(minutes=tz_offset_minutes)
    hourly_counts = [0] * 24
    peak_hour: int | None = None
    peak_count = 0
    for token in tokens:
        hour = (token.issued_at + offset).hour
        hourly_counts[hour] += 1
        if hourly_counts[hour] > peak_count:
            peak_count = hourly_counts[hour]
            peak_hour = hour

    counter_ids = {t.counter_id for t in tokens}
    nonterminal_by_counter: dict[int, int] = {
        cid: 0 for cid in counter_ids
    }
    if counter_ids:
        rows = db.execute(
            select(Token.counter_id, func.count(Token.id))
            .where(
                Token.institution_id == user.institution_id,
                Token.counter_id.in_(counter_ids),
                Token.status.in_(NON_TERMINAL_STATUSES),
            )
            .group_by(Token.counter_id)
        ).all()
        nonterminal_by_counter = {cid: int(count) for cid, count in rows}

    counters = db.execute(
        select(Counter)
        .where(
            Counter.institution_id == user.institution_id,
            Counter.id.in_(counter_ids) if counter_ids else Counter.id.is_(None),
        )
        .order_by(Counter.id)
    ).scalars().all()
    counter_names = {c.id: c.name for c in counters}

    per_counter: list[CounterAnalytics] = []
    for counter in sorted(counters, key=lambda c: c.id):
        c_tokens = [t for t in tokens if t.counter_id == counter.id]
        c_waits = [
            _minutes(t.issued_at, t.called_at)
            for t in c_tokens
            if t.called_at is not None
        ]
        per_counter.append(
            CounterAnalytics(
                counter_id=counter.id,
                counter_name=counter.name,
                issued=len(c_tokens),
                served=sum(1 for t in c_tokens if t.status == TokenStatus.SERVED),
                no_shows=sum(1 for t in c_tokens if t.status == TokenStatus.NO_SHOW),
                waiting=nonterminal_by_counter.get(counter.id, 0),
                avg_wait_min=_avg(c_waits),
            )
        )

    waiting_now_rows = db.execute(
        select(Token.counter_id, Token.status, func.count(Token.id))
        .where(
            Token.institution_id == user.institution_id,
            Token.status.in_(NON_TERMINAL_STATUSES),
        )
        .group_by(Token.counter_id, Token.status)
    ).all()
    waiting_now = sum(int(n) for _, s, n in waiting_now_rows if s == TokenStatus.WAITING)
    in_service_now = sum(
        int(n)
        for _, s, n in waiting_now_rows
        if s in (TokenStatus.CALLED, TokenStatus.IN_SERVICE)
    )

    now = datetime.now(timezone.utc)
    return AnalyticsSummary(
        from_at=from_at,
        to_at=to_at,
        issued=issued,
        served=served,
        no_shows=no_shows,
        waiting_now=waiting_now,
        in_service_now=in_service_now,
        abandonment_rate=(no_shows / resolved) if resolved else None,
        avg_wait_min=_avg(waits),
        avg_total_min=_avg(totals),
        peak_hour=peak_hour,
        hourly=[HourlyCount(hour=h, count=c) for h, c in enumerate(hourly_counts)],
        per_counter=per_counter,
    )
