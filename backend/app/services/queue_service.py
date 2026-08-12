from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Counter, Token, TokenStatus
from app.models.user import utcnow
from app.schemas.counter import CounterOut
from app.schemas.queue import CounterQueueStatus, QueueSnapshot
from app.schemas.token import TokenOut

NON_TERMINAL_STATUSES = (
    TokenStatus.WAITING,
    TokenStatus.CALLED,
    TokenStatus.IN_SERVICE,
)


def get_owned_token(db: Session, institution_id: int, token_id: int) -> Token:
    token = db.get(Token, token_id)
    if token is None or token.institution_id != institution_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    return token


def _require_status(token: Token, *expected: TokenStatus) -> None:
    if token.status not in expected:
        allowed = ", ".join(s.value for s in expected)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Token is {token.status.value}, expected {allowed}",
        )


def token_position(db: Session, token: Token) -> int:
    ahead = db.execute(
        select(func.count(Token.id)).where(
            Token.counter_id == token.counter_id,
            Token.status.in_(NON_TERMINAL_STATUSES),
            or_(
                Token.issued_at < token.issued_at,
                (Token.issued_at == token.issued_at) & (Token.id < token.id),
            ),
        )
    ).scalar_one()
    return ahead + 1


def token_out(db: Session, token: Token) -> TokenOut:
    position = token_position(db, token) if token.status in NON_TERMINAL_STATUSES else None
    return TokenOut.model_validate(token).model_copy(update={"position": position})


def call_token(db: Session, token: Token) -> None:
    _require_status(token, TokenStatus.WAITING)
    token.status = TokenStatus.CALLED
    token.called_at = utcnow()
    db.commit()
    db.refresh(token)


def start_service(db: Session, token: Token) -> None:
    _require_status(token, TokenStatus.CALLED)
    token.status = TokenStatus.IN_SERVICE
    db.commit()
    db.refresh(token)


def complete_token(db: Session, token: Token) -> None:
    _require_status(token, TokenStatus.IN_SERVICE)
    token.status = TokenStatus.SERVED
    token.completed_at = utcnow()
    db.commit()
    db.refresh(token)


def mark_no_show(db: Session, token: Token) -> None:
    _require_status(token, TokenStatus.WAITING, TokenStatus.CALLED)
    token.status = TokenStatus.NO_SHOW
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

    counter_statuses: list[CounterQueueStatus] = []
    for counter in counters:
        tokens = (
            db.execute(
                select(Token)
                .where(Token.counter_id == counter.id, Token.status.in_(NON_TERMINAL_STATUSES))
                .order_by(Token.issued_at, Token.id)
            )
            .scalars()
            .all()
        )
        counts: dict[TokenStatus, int] = {s: 0 for s in NON_TERMINAL_STATUSES}
        token_outs: list[TokenOut] = []
        for index, token in enumerate(tokens):
            counts[token.status] += 1
            token_outs.append(
                TokenOut.model_validate(token).model_copy(update={"position": index + 1})
            )
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