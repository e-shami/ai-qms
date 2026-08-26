"""Staff self-service: workspace view, presence, and counter claims.

These endpoints key off the signed-in account's linked Personnel record
(via deps.get_current_personnel) rather than the role string, so the
permissions follow "has an active staff record", not "is staff role".
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_personnel
from app.database import get_db
from app.models import Counter, Personnel, Token, TokenStatus
from app.schemas.counter import CounterOut
from app.schemas.staff import (
    CounterClaim,
    StaffToday,
    StaffWorkspace,
    WorkStatusUpdate,
    WORK_STATUSES,
)
from app.services import queue_service
from app.services.broadcast import broadcast_all
from app.services.token_service import get_owned_counter

router = APIRouter(prefix="/staff", tags=["staff"])


def _day_bounds(tz_offset_minutes: int) -> tuple[datetime, datetime]:
    """Local-day window (issued_at scope) for the caller's timezone."""
    now = datetime.now(timezone.utc)
    local = now + timedelta(minutes=tz_offset_minutes)
    start_local = local.replace(hour=0, minute=0, second=0, microsecond=0)
    start = start_local - timedelta(minutes=tz_offset_minutes)
    return start, start + timedelta(days=1)


def _today_stats(
    db: Session,
    institution_id: int,
    personnel_id: int,
    tz_offset_minutes: int,
) -> StaffToday:
    start, end = _day_bounds(tz_offset_minutes)
    tokens = (
        db.execute(
            select(Token).where(
                Token.institution_id == institution_id,
                Token.served_by_personnel_id == personnel_id,
                Token.completed_at.is_not(None),
                Token.completed_at >= start,
                Token.completed_at < end,
            )
        )
        .scalars()
        .all()
    )

    durations = [
        (t.completed_at - t.called_at).total_seconds() / 60.0
        for t in tokens
        if t.called_at is not None and t.completed_at > t.called_at
    ]
    avg_service = round(sum(durations) / len(durations), 1) if durations else None

    return StaffToday(
        served_by_me=sum(1 for t in tokens if t.status == TokenStatus.SERVED),
        no_shows_by_me=sum(1 for t in tokens if t.status == TokenStatus.NO_SHOW),
        declined_by_me=sum(1 for t in tokens if t.status == TokenStatus.DECLINED),
        avg_service_min=avg_service,
    )


@router.get("/workspace", response_model=StaffWorkspace)
def workspace(
    tz_offset_minutes: int = Query(default=0, ge=-840, le=840),
    personnel: Personnel = Depends(get_current_personnel),
    db: Session = Depends(get_db),
) -> StaffWorkspace:
    counter = None
    queue = None
    if personnel.counter_id is not None:
        counter = db.get(Counter, personnel.counter_id)
        if counter is not None and counter.is_active:
            queue_snapshot = queue_service.snapshot(
                db,
                personnel.institution_id,
                counter_id=counter.id,
            )
            queue = queue_snapshot.counters[0] if queue_snapshot.counters else None

    return StaffWorkspace(
        personnel_id=personnel.id,
        name=personnel.name,
        title=personnel.title,
        work_status=personnel.work_status,
        counter=CounterOut.model_validate(counter) if counter is not None else None,
        queue=queue,
        today=_today_stats(db, personnel.institution_id, personnel.id, tz_offset_minutes),
        updated_at=datetime.now(timezone.utc),
    )


@router.patch("/status")
async def update_status(
    payload: WorkStatusUpdate,
    personnel: Personnel = Depends(get_current_personnel),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    if payload.work_status not in WORK_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"work_status must be one of: {', '.join(WORK_STATUSES)}",
        )
    personnel.work_status = payload.work_status
    db.commit()
    await broadcast_all(db, personnel.institution_id)
    return {"work_status": personnel.work_status}


@router.post("/counter")
async def claim_counter(
    payload: CounterClaim,
    personnel: Personnel = Depends(get_current_personnel),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    counter = get_owned_counter(db, personnel.institution_id, payload.counter_id)

    # Serialize claims on the counter row so two simultaneous requests
    # cannot both pass the occupancy check.
    locked = db.execute(
        select(Counter).where(Counter.id == counter.id).with_for_update()
    ).scalar_one()
    occupant = db.execute(
        select(Personnel).where(
            Personnel.institution_id == personnel.institution_id,
            Personnel.counter_id == locked.id,
            Personnel.is_active.is_(True),
            Personnel.work_status != "off_duty",
            Personnel.id != personnel.id,
        )
    ).scalars().first()
    if occupant is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Counter in use by {occupant.name}",
        )

    previous = personnel.counter_id
    personnel.counter_id = locked.id
    db.commit()

    if previous != locked.id:
        await broadcast_all(db, personnel.institution_id)
    return {"counter_id": locked.id}