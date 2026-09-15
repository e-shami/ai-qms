"""Service-only phone lookup. Never expose this capability anonymously."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import verify_internal_api_key
from app.database import get_db
from app.models import Institution, Token
from app.schemas.token import PublicTicketOut
from app.services.token_service import build_public_ticket
from app.services.queue_service import NON_TERMINAL_STATUSES

router = APIRouter(prefix="/internal/bot", tags=["internal"],
                   dependencies=[Depends(verify_internal_api_key)])


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
