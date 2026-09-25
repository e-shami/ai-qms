"""Service-only phone lookup. Never expose this capability anonymously."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StrictBool
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import verify_internal_api_key
from app.database import get_db
from app.models import Institution, Token
from app.schemas.token import PublicTicketOut, TokenCreate
from app.services.token_service import build_public_ticket, issue_token
from app.services.broadcast import broadcast_queue
from app.services.queue_service import NON_TERMINAL_STATUSES

router = APIRouter(prefix="/internal/bot", tags=["internal"],
                   dependencies=[Depends(verify_internal_api_key)])


class ProfileLookup(BaseModel):
    phone: str = Field(pattern=r"^[1-9][0-9]{6,14}$")
    institution_id: int = Field(gt=0)


def recent_profile(db: Session, payload: ProfileLookup, profile_ref: int | None = None):
    query = select(Token).join(Institution).where(
        Institution.is_active.is_(True), Token.institution_id == payload.institution_id,
        func.regexp_replace(Token.customer_phone, r"[^0-9]", "", "g") == payload.phone,
        Token.customer_cnic.is_not(None), Token.referral_source.is_not(None),
    )
    if profile_ref is not None:
        query = query.where(Token.id == profile_ref)
    return db.scalars(query.order_by(Token.issued_at.desc(), Token.id.desc()).limit(1)).first()


class ProfileAvailable(BaseModel):
    available: bool
    profile_ref: int | None


@router.post("/profile", response_model=ProfileAvailable)
def lookup_profile(payload: ProfileLookup, db: Session = Depends(get_db)):
    # Never disclose stored identity to a shared/recycled phone.
    profile = recent_profile(db, payload)
    return {"available": profile is not None, "profile_ref": profile.id if profile else None}


class ReuseIntake(TokenCreate, ProfileLookup):
    confirm_same_person: StrictBool
    profile_ref: int = Field(gt=0, strict=True)


@router.post("/tokens/reuse", response_model=PublicTicketOut, status_code=201)
async def reuse_intake(payload: ReuseIntake, db: Session = Depends(get_db)):
    if not payload.confirm_same_person:
        raise HTTPException(status_code=422, detail="Explicit same-person confirmation required")
    profile = recent_profile(db, payload, payload.profile_ref)
    if profile is None:
        raise HTTPException(status_code=409, detail="No saved intake; enter new details")
    token, _ = issue_token(db, institution_id=payload.institution_id, counter_id=payload.counter_id,
        customer_name=payload.customer_name, customer_phone=payload.phone,
        customer_cnic=profile.customer_cnic, referral_source=profile.referral_source,
        referral_organization=profile.referral_organization,
        requested_priority=payload.requested_priority, priority_reason=payload.priority_reason)
    try:
        await broadcast_queue(db, payload.institution_id)
    except Exception:
        logging.getLogger(__name__).warning("Queue broadcast failed after bot issuance")
    return build_public_ticket(db, token)


class PhoneLookup(BaseModel):
    phone: str = Field(pattern=r"^[1-9][0-9]{6,14}$")
    offset: int = Field(default=0, ge=0, le=1000000)
    token_id: int | None = Field(default=None, gt=0)
    token_number: str | None = Field(default=None, max_length=32)


class BotTicket(PublicTicketOut):
    id: int
    institution_id: int
    institution_name: str


class BotTicketPage(BaseModel):
    items: list[BotTicket]
    has_more: bool


@router.post("/tokens/lookup", response_model=BotTicketPage)
def lookup_tokens(payload: PhoneLookup, db: Session = Depends(get_db)) -> BotTicketPage:
    # Normalize formatting on existing records, but never guess country codes.
    query = select(Token, Institution.name).join(Institution).where(
        Institution.is_active.is_(True),
        Token.status.in_(NON_TERMINAL_STATUSES),
        func.regexp_replace(Token.customer_phone, r"[^0-9]", "", "g") == payload.phone,
    )
    if payload.token_id is not None:
        query = query.where(Token.id == payload.token_id)
    if payload.token_number is not None:
        query = query.where(Token.token_number == payload.token_number.upper())
    rows = db.execute(query.order_by(Token.issued_at.desc(), Token.id.desc())
                      .offset(payload.offset).limit(9)).all()
    return BotTicketPage(items=[
        BotTicket(**build_public_ticket(db, token).model_dump(), id=token.id,
                  institution_id=token.institution_id, institution_name=name)
        for token, name in rows[:8]
    ], has_more=len(rows) > 8)
