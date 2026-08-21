from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Counter, Token, TokenStatus
from app.schemas.token import PublicTicketOut
from app.services.prediction_service import estimate_wait_minutes
from app.services.queue_service import NON_TERMINAL_STATUSES, token_position

_PREFIX_LENGTH = 3


def prefix_for(counter: Counter) -> str:
    letters = "".join(ch for ch in counter.name if ch.isalnum()).upper()
    return (letters[:_PREFIX_LENGTH] or "Q")


def get_owned_counter(
    db: Session,
    institution_id: int,
    counter_id: int,
    *,
    active_only: bool = True,
) -> Counter:
    counter = db.get(Counter, counter_id)
    if counter is None or counter.institution_id != institution_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Counter not found")
    if active_only and not counter.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Counter is not active")
    return counter


def issue_token(
    db: Session,
    *,
    institution_id: int,
    counter_id: int,
    customer_name: str | None,
    customer_phone: str | None = None,
) -> tuple[Token, int]:
    counter = get_owned_counter(db, institution_id, counter_id)
    prefix = prefix_for(counter)
    seq = (
        db.execute(
            select(func.count(Token.id)).where(
                Token.counter_id == counter.id,
                Token.token_number.like(f"{prefix}-%"),
            )
        ).scalar_one()
        + 1
    )
    token = Token(
        institution_id=institution_id,
        counter_id=counter.id,
        token_number=f"{prefix}-{seq:04d}",
        customer_name=customer_name or None,
        customer_phone=customer_phone or None,
        status=TokenStatus.WAITING,
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return token, token_position(db, token)


def build_public_ticket(db: Session, token: Token) -> PublicTicketOut:
    """PII-free ticket view for customers: no name/phone is exposed."""
    counter = db.get(Counter, token.counter_id)
    position = token_position(db, token) if token.status in NON_TERMINAL_STATUSES else None
    people_ahead = position - 1 if position is not None else None
    estimated_wait = (
        estimate_wait_minutes(db, institution_id=token.institution_id, counter=counter)
        if token.status in NON_TERMINAL_STATUSES
        else None
    )
    return PublicTicketOut(
        token_number=token.token_number,
        status=token.status,
        counter_id=token.counter_id,
        counter_name=counter.name if counter is not None else "Counter",
        issued_at=token.issued_at,
        called_at=token.called_at,
        completed_at=token.completed_at,
        position=position,
        people_ahead=people_ahead,
        estimated_wait_min=estimated_wait,
    )