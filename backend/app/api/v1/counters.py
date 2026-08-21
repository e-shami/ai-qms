from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.database import get_db
from app.models import Counter, Token, User
from app.schemas.counter import CounterCreate, CounterOut, CounterUpdate
from app.services.queue_service import NON_TERMINAL_STATUSES
from app.services.token_service import get_owned_counter

router = APIRouter(prefix="/counters", tags=["counters"])


@router.get("", response_model=list[CounterOut])
def list_counters(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Counter]:
    return (
        db.execute(
            select(Counter)
            .where(Counter.institution_id == user.institution_id)
            .order_by(Counter.id)
        )
        .scalars()
        .all()
    )


@router.post("", response_model=CounterOut, status_code=status.HTTP_201_CREATED)
def create_counter(
    payload: CounterCreate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Counter:
    counter = Counter(
        institution_id=user.institution_id,
        name=payload.name,
        type=payload.type,
    )
    db.add(counter)
    db.commit()
    db.refresh(counter)
    return counter


@router.patch("/{counter_id}", response_model=CounterOut)
def update_counter(
    counter_id: int,
    payload: CounterUpdate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Counter:
    counter = get_owned_counter(db, user.institution_id, counter_id, active_only=False)
    if payload.name is not None:
        counter.name = payload.name
    if payload.type is not None:
        counter.type = payload.type
    if payload.is_active is not None:
        counter.is_active = payload.is_active
    db.commit()
    db.refresh(counter)
    return counter


@router.delete("/{counter_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_counter(
    counter_id: int,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> None:
    counter = get_owned_counter(db, user.institution_id, counter_id, active_only=False)
    if not counter.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Counter is already inactive",
        )
    active_tokens = db.execute(
        select(func.count(Token.id)).where(
            Token.counter_id == counter.id,
            Token.status.in_(NON_TERMINAL_STATUSES),
        )
    ).scalar_one()
    if active_tokens > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot deactivate counter: still has tokens waiting or in service",
        )
    counter.is_active = False
    db.commit()


@router.post("/{counter_id}/activate", response_model=CounterOut)
def activate_counter(
    counter_id: int,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Counter:
    counter = get_owned_counter(db, user.institution_id, counter_id, active_only=False)
    counter.is_active = True
    db.commit()
    db.refresh(counter)
    return counter