"""Aggregation behind GET /overview/admin.

One payload covering everything the admin dashboard renders: live token
funnel, today's totals, counter board, staff roster, hourly series.
Follows the same compute-in-Python-over-one-query pattern as the
analytics endpoint — daily volumes are small.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Counter, Token, TokenStatus
from app.schemas.overview import (
    AdminOverview,
    CounterBoardEntry,
    HourlyPair,
    LiveFunnel,
    TodayTotals,
)
from app.services import presence_service, queue_service
from app.services.queue_service import NON_TERMINAL_STATUSES


def _day_bounds(tz_offset_minutes: int) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    start_local = (now + timedelta(minutes=tz_offset_minutes)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    start = start_local - timedelta(minutes=tz_offset_minutes)
    return start, start + timedelta(days=1)


def _minutes(start: datetime | None, end: datetime | None) -> float | None:
    if start is None or end is None:
        return None
    return (end - start).total_seconds() / 60.0


def admin_overview(
    db: Session,
    institution_id: int,
    tz_offset_minutes: int,
) -> AdminOverview:
    start, end = _day_bounds(tz_offset_minutes)

    live_rows = db.execute(
        select(Token.status, func.count(Token.id))
        .where(Token.institution_id == institution_id, Token.status.in_(NON_TERMINAL_STATUSES))
        .group_by(Token.status)
    ).all()
    live_counts = {s: int(n) for s, n in live_rows}
    funnel = LiveFunnel(
        waiting=live_counts.get(TokenStatus.WAITING, 0),
        called=live_counts.get(TokenStatus.CALLED, 0),
        in_service=live_counts.get(TokenStatus.IN_SERVICE, 0),
    )

    todays_tokens = (
        db.execute(
            select(Token)
            .where(
                Token.institution_id == institution_id,
                Token.issued_at >= start,
                Token.issued_at < end,
            )
            .order_by(Token.issued_at, Token.id)
        )
        .scalars()
        .all()
    )

    waits = [
        value
        for value in (_minutes(t.issued_at, t.called_at) for t in todays_tokens if t.called_at)
        if value is not None
    ]
    today = TodayTotals(
        issued=len(todays_tokens),
        served=sum(1 for t in todays_tokens if t.status == TokenStatus.SERVED),
        no_shows=sum(1 for t in todays_tokens if t.status == TokenStatus.NO_SHOW),
        declined=sum(1 for t in todays_tokens if t.status == TokenStatus.DECLINED),
        avg_wait_min=round(sum(waits) / len(waits), 1) if waits else None,
    )

    hourly_issued = [0] * 24
    hourly_completed = [0] * 24
    offset_delta = timedelta(minutes=tz_offset_minutes)
    for token in todays_tokens:
        hourly_issued[(token.issued_at + offset_delta).hour] += 1
        if token.completed_at is not None:
            hourly_completed[(token.completed_at + offset_delta).hour] += 1

    hourly: list[HourlyPair] = []
    for hour, issued in enumerate(hourly_issued):
        hourly.append(
            HourlyPair(
                hour=hour,
                issued=issued,
                completed=hourly_completed[hour],
            )
        )

    counters = (
        db.execute(
            select(Counter)
            .where(Counter.institution_id == institution_id)
            .order_by(Counter.id)
        )
        .scalars()
        .all()
    )
    ctx = queue_service.enrichment_context(db, institution_id)

    board: list[CounterBoardEntry] = []
    for counter in counters:
        entry = CounterBoardEntry(
            counter_id=counter.id,
            counter_name=counter.name,
            counter_type=counter.type,
            is_active=counter.is_active,
            status="closed",
            waiting_count=0,
            cv_queue_length=counter.cv_queue_length if counter.cv_enabled else None,
            cv_service_rate=counter.cv_service_rate if counter.cv_enabled else None,
            cv_estimated_wait_min=counter.cv_estimated_wait_min if counter.cv_enabled else None,
            cv_last_update=counter.cv_last_update,
            cv_enabled=counter.cv_enabled,
        )
        if counter.is_active:
            active_rows = (
                db.execute(
                    select(Token.status, func.count(Token.id))
                    .where(Token.counter_id == counter.id, Token.status.in_(NON_TERMINAL_STATUSES))
                    .group_by(Token.status)
                )
                .all()
            )
            counts = {s: int(n) for s, n in active_rows}
            entry.waiting_count = counts.get(TokenStatus.WAITING, 0)

            current = (
                db.execute(
                    select(Token)
                    .where(
                        Token.counter_id == counter.id,
                        Token.status.in_((TokenStatus.CALLED, TokenStatus.IN_SERVICE)),
                    )
                    .order_by(Token.called_at.desc(), Token.id.desc())
                    .limit(1)
                )
                .scalars()
                .first()
            )
            if current is not None:
                entry.current_token_number = current.token_number
                entry.current_token_status = current.status
                if current.served_by_personnel_id is not None:
                    entry.served_by_name = ctx.names.get(current.served_by_personnel_id)
                entry.status = "serving"
            else:
                entry.status = "idle"
        board.append(entry)

    return AdminOverview(
        institution_id=institution_id,
        updated_at=datetime.now(timezone.utc),
        live=funnel,
        today=today,
        counters=board,
        staff=presence_service.roster(db, institution_id),
        hourly=hourly,
    )
