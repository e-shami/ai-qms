from __future__ import annotations

from datetime import datetime, timezone
from typing import NamedTuple, Sequence

from fastapi import HTTPException, status
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Counter, Personnel, Token, TokenStatus
from app.models.user import utcnow
from app.schemas.counter import CounterOut
from app.schemas.queue import CounterQueueStatus, QueueSnapshot
from app.schemas.token import TokenOut
from app.services.prediction_service import institution_service_rate

NON_TERMINAL_STATUSES = (
    TokenStatus.WAITING,
    TokenStatus.CALLED,
    TokenStatus.IN_SERVICE,
)


class Enrichment(NamedTuple):
    """Per-request lookup tables so decorating many tokens costs O(1) queries."""

    names: dict[int, str]
    service_rate: float


def enrichment_context(db: Session, institution_id: int) -> Enrichment:
    names = {
        personnel_id: name
        for personnel_id, name in db.execute(
            select(Personnel.id, Personnel.name).where(
                Personnel.institution_id == institution_id
            )
        ).all()
    }
    rate = institution_service_rate(db, institution_id)
    return Enrichment(
        names=names,
        service_rate=rate if rate else settings.PREDICT_DEFAULT_SERVICE_MIN,
    )


def decorate(db: Session, institution_id: int, out: TokenOut, ctx: Enrichment | None) -> TokenOut:
    """Attach computed fields (server name, ETA) to a built token view."""
    if ctx is None:
        ctx = enrichment_context(db, institution_id)
    updates: dict[str, object] = {}
    if out.served_by_personnel_id is not None:
        updates["served_by_name"] = ctx.names.get(out.served_by_personnel_id)
    if out.status == TokenStatus.WAITING and out.position is not None:
        # Everyone ahead — including the token mid-service — must clear first.
        updates["eta_min"] = round(max(0, out.position - 1) * ctx.service_rate, 1)
    return out.model_copy(update=updates) if updates else out


def get_owned_token(db: Session, institution_id: int, token_id: int) -> Token:
    token = db.get(Token, token_id)
    if token is None or token.institution_id != institution_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    return token


def get_caller_personnel(db: Session, user_id: int, institution_id: int) -> Personnel | None:
    """The acting account's staff record; admins without one simply stay anonymous."""
    return db.execute(
        select(Personnel).where(
            Personnel.user_id == user_id,
            Personnel.institution_id == institution_id,
        )
    ).scalar_one_or_none()


def _require_status(token: Token, *expected: TokenStatus) -> None:
    if token.status not in expected:
        allowed = ", ".join(s.value for s in expected)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Token is {token.status.value}, expected {allowed}",
        )


def token_position(db: Session, token: Token) -> int | None:
    ids = db.scalars(select(Token.id).where(
        Token.institution_id == token.institution_id, Token.counter_id == token.counter_id,
        Token.status.in_(NON_TERMINAL_STATUSES),
    ).order_by(*queue_order())).all()
    try:
        return ids.index(token.id) + 1
    except ValueError:
        # A concurrent terminal transition can remove a previously active token.
        db.refresh(token)
        return None


def queue_order():
    """Active work first, then approved accessibility, FIFO within each band."""
    return (case((Token.status != TokenStatus.WAITING, 0), else_=1),
            case(((Token.status == TokenStatus.WAITING) &
                  (Token.effective_priority == "accessibility"), 0), else_=1),
            Token.issued_at, Token.id)


def lock_counter(db: Session, token: Token) -> None:
    db.execute(select(Counter).where(Counter.id == token.counter_id,
        Counter.institution_id == token.institution_id).with_for_update()).scalar_one()
    db.refresh(token)


def token_out(db: Session, token: Token) -> TokenOut:
    position = token_position(db, token) if token.status in NON_TERMINAL_STATUSES else None
    out = TokenOut.model_validate(token).model_copy(update={"position": position})
    return decorate(db, token.institution_id, out, None)


def resolve_personnel_link(db: Session, token: Token, user) -> None:
    """Stamp who claimed the token, when the caller has a staff record."""
    personnel = get_caller_personnel(db, user.id, user.institution_id)
    if personnel is not None:
        token.served_by_personnel_id = personnel.id


def call_token(db: Session, token: Token, user=None) -> None:
    lock_counter(db, token)
    _require_status(token, TokenStatus.WAITING)
    first = db.scalars(select(Token).where(
        Token.institution_id == token.institution_id, Token.counter_id == token.counter_id,
        Token.status.in_(NON_TERMINAL_STATUSES),
    ).order_by(*queue_order()).limit(1)).first()
    if first is None or first.id != token.id:
        raise HTTPException(status_code=409, detail="Finish active service and call the next waiting token in queue order")
    token.status = TokenStatus.CALLED
    token.called_at = utcnow()
    if user is not None:
        resolve_personnel_link(db, token, user)
    db.commit()
    db.refresh(token)


def start_service(db: Session, token: Token, user=None) -> None:
    lock_counter(db, token)
    _require_status(token, TokenStatus.CALLED)
    if user is not None:
        resolve_personnel_link(db, token, user)
    token.status = TokenStatus.IN_SERVICE
    db.commit()
    db.refresh(token)


def complete_token(db: Session, token: Token) -> None:
    lock_counter(db, token)
    _require_status(token, TokenStatus.IN_SERVICE)
    token.status = TokenStatus.SERVED
    token.completed_at = utcnow()
    db.commit()
    db.refresh(token)


def mark_no_show(db: Session, token: Token) -> None:
    lock_counter(db, token)
    _require_status(token, TokenStatus.WAITING, TokenStatus.CALLED)
    token.status = TokenStatus.NO_SHOW
    token.completed_at = utcnow()
    db.commit()
    db.refresh(token)


def decline_token(db: Session, token: Token, reason: str) -> None:
    lock_counter(db, token)
    _require_status(token, TokenStatus.WAITING, TokenStatus.CALLED, TokenStatus.IN_SERVICE)
    token.status = TokenStatus.DECLINED
    token.decline_reason = reason
    token.completed_at = utcnow()
    db.commit()
    db.refresh(token)


def snapshot(
    db: Session,
    institution_id: int,
    *,
    counter_id: int | None = None,
) -> QueueSnapshot:
    if counter_id is not None:
        counter = db.get(Counter, counter_id)
        if counter is None or counter.institution_id != institution_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Counter not found")

    query = (
        select(Counter)
        .where(Counter.institution_id == institution_id, Counter.is_active.is_(True))
        .order_by(Counter.id)
    )
    if counter_id is not None:
        query = query.where(Counter.id == counter_id)
    counters: Sequence[Counter] = db.execute(query).scalars().all()

    ctx = enrichment_context(db, institution_id)

    counter_statuses: list[CounterQueueStatus] = []
    for counter in counters:
        tokens = (
            db.execute(
                select(Token)
                .where(Token.institution_id == institution_id, Token.counter_id == counter.id, Token.status.in_(NON_TERMINAL_STATUSES))
                .order_by(*queue_order())
            )
            .scalars()
            .all()
        )
        counts: dict[TokenStatus, int] = {s: 0 for s in NON_TERMINAL_STATUSES}
        token_outs: list[TokenOut] = []
        for index, token in enumerate(tokens):
            counts[token.status] += 1
            out = TokenOut.model_validate(token).model_copy(update={"position": index + 1})
            token_outs.append(decorate(db, institution_id, out, ctx))
        counter_statuses.append(
            CounterQueueStatus(
                counter=CounterOut.model_validate(counter),
                waiting_count=counts[TokenStatus.WAITING],
                called_count=counts[TokenStatus.CALLED],
                in_service_count=counts[TokenStatus.IN_SERVICE],
                tokens=token_outs,
            )
        )

    return QueueSnapshot(
        institution_id=institution_id,
        counter_id=counter_id,
        updated_at=datetime.now(timezone.utc),
        counters=counter_statuses,
    )
