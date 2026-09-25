from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Counter, Institution, Token, TokenStatus
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
    customer_cnic: str | None = None,
    referral_source: str | None = None,
    referral_organization: str | None = None,
    requested_priority: str = "normal",
    priority_reason: str | None = None,
) -> tuple[Token, int | None]:
    counter = get_owned_counter(db, institution_id, counter_id)
    institution = db.get(Institution, institution_id)
    if requested_priority != "normal" and (institution.type or "").strip().lower() != "hospital":
        raise HTTPException(status_code=422, detail="Accessibility priority requests are hospital-only")
    db.execute(select(Counter).where(Counter.id == counter.id).with_for_update()).scalar_one()
    prefix = prefix_for(counter)
    numbers = db.scalars(select(Token.token_number).where(
        Token.institution_id == institution_id, Token.counter_id == counter.id,
        Token.token_number.like(f"{prefix}-%"),
    ))
    seq = max((int(number[len(prefix) + 1:]) for number in numbers
               if number[len(prefix) + 1:].isascii() and number[len(prefix) + 1:].isdigit()), default=0) + 1
    token = Token(
        institution_id=institution_id,
        counter_id=counter.id,
        token_number=f"{prefix}-{seq:04d}",
        customer_name=customer_name or None,
        customer_phone=customer_phone or None,
        customer_cnic=customer_cnic,
        referral_source=referral_source,
        referral_organization=referral_organization,
        requested_priority=requested_priority,
        priority_reason=priority_reason,
        priority_review="pending" if requested_priority == "accessibility" else "not_requested",
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
        estimate_wait_minutes(
            db,
            institution_id=token.institution_id,
            counter=counter,
            people_ahead=people_ahead,
        )[0]
        if people_ahead is not None
        else None
    )
    return PublicTicketOut(
        requested_priority=token.requested_priority,
        effective_priority=token.effective_priority,
        priority_review=token.priority_review,
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
