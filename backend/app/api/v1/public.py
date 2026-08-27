"""Anonymous, rate-limited endpoints for the customer-facing flow.

Institutions opt in to public visibility by being `is_active`; only
active counters are listed. Token lookups return PII-free tickets.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Counter, Institution, Token
from app.schemas.counter import PublicCounterOut
from app.schemas.institution import PublicInstitutionOut
from app.schemas.token import PublicTokenIssue, PublicTicketOut
from app.services import token_service
from app.services.broadcast import broadcast_queue
from app.utils.rate_limit import public_issue_limiter, public_lookup_limiter

router = APIRouter(prefix="/public", tags=["public"])


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _active_institution(db: Session, institution_id: int) -> Institution:
    institution = db.get(Institution, institution_id)
    if institution is None or not institution.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Institution not found"
        )
    return institution


@router.get("/institutions", response_model=list[PublicInstitutionOut])
def list_public_institutions(db: Session = Depends(get_db)) -> list[Institution]:
    return (
        db.execute(
            select(Institution)
            .where(Institution.is_active.is_(True))
            .order_by(Institution.name)
        )
        .scalars()
        .all()
    )


@router.get(
    "/institutions/{institution_id}/counters", response_model=list[PublicCounterOut]
)
def list_public_counters(
    institution_id: int, db: Session = Depends(get_db)
) -> list[Counter]:
    _active_institution(db, institution_id)
    return (
        db.execute(
            select(Counter)
            .where(Counter.institution_id == institution_id, Counter.is_active.is_(True))
            .order_by(Counter.id)
        )
        .scalars()
        .all()
    )


@router.post("/tokens", response_model=PublicTicketOut, status_code=status.HTTP_201_CREATED)
async def issue_public_token(
    payload: PublicTokenIssue,
    request: Request,
    db: Session = Depends(get_db),
) -> PublicTicketOut:
    if not public_issue_limiter.allow(_client_key(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests, try again later",
        )
    institution = _active_institution(db, payload.institution_id)
    counter = db.get(Counter, payload.counter_id)
    if (
        counter is None
        or counter.institution_id != institution.id
        or not counter.is_active
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Counter not found")

    token, position = token_service.issue_token(
        db,
        institution_id=institution.id,
        counter_id=counter.id,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
    )
    await broadcast_queue(db, institution.id)
    ticket = token_service.build_public_ticket(db, token)
    ticket.position = position
    return ticket


@router.get("/tokens/{token_number}", response_model=PublicTicketOut)
def get_public_token(
    token_number: str,
    institution_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> PublicTicketOut:
    if not public_lookup_limiter.allow(_client_key(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests, try again later",
        )
    _active_institution(db, institution_id)
    token = (
        db.execute(
            select(Token)
            .where(
                Token.institution_id == institution_id,
                Token.token_number == token_number,
            )
            .order_by(Token.issued_at.desc(), Token.id.desc())
        )
        .scalars()
        .first()
    )
    if token is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    return token_service.build_public_ticket(db, token)
