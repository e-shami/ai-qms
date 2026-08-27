from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models import Counter, Token, TokenStatus, User
from app.schemas.token import DeclineRequest, TokenCreate, TokenOut, TokenPage
from app.services import queue_service, token_service
from app.services.broadcast import broadcast_queue

router = APIRouter(prefix="/tokens", tags=["tokens"])


@router.post("", response_model=TokenOut, status_code=201)
async def issue_token(
    payload: TokenCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token, _position = token_service.issue_token(
        db,
        institution_id=user.institution_id,
        counter_id=payload.counter_id,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
    )
    out = queue_service.token_out(db, token)
    await broadcast_queue(db, user.institution_id)
    return out


@router.get("", response_model=TokenPage)
def list_tokens(
    counter_id: int | None = None,
    status: TokenStatus | None = Query(default=None),
    issued_from: datetime | None = Query(default=None),
    issued_to: datetime | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenPage:
    query = select(Token).where(Token.institution_id == user.institution_id)
    if counter_id is not None:
        token_service.get_owned_counter(db, user.institution_id, counter_id, active_only=False)
        query = query.where(Token.counter_id == counter_id)
    if status is not None:
        query = query.where(Token.status == status)
    if issued_from is not None:
        query = query.where(Token.issued_at >= issued_from)
    if issued_to is not None:
        query = query.where(Token.issued_at < issued_to)

    total = db.execute(
        select(func.count()).select_from(query.subquery())
    ).scalar_one()
    tokens = (
        db.execute(
            query.order_by(Token.issued_at.desc(), Token.id.desc())
            .offset(offset)
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return TokenPage(
        items=[queue_service.token_out(db, token) for token in tokens],
        total=int(total),
    )


@router.post("/{token_id}/call", response_model=TokenOut)
async def call_token(
    token_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token = queue_service.get_owned_token(db, user.institution_id, token_id)
    queue_service.call_token(db, token, user=user)
    await broadcast_queue(db, user.institution_id)
    return queue_service.token_out(db, token)


@router.post("/{token_id}/start", response_model=TokenOut)
async def start_service(
    token_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token = queue_service.get_owned_token(db, user.institution_id, token_id)
    # A token can be started by a different staff member than the one who
    # called it (shift handover) — ownership follows whoever starts service.
    queue_service.resolve_personnel_link(db, token, user)
    queue_service.start_service(db, token)
    await broadcast_queue(db, user.institution_id)
    return queue_service.token_out(db, token)


@router.post("/{token_id}/complete", response_model=TokenOut)
async def complete_token(
    token_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token = queue_service.get_owned_token(db, user.institution_id, token_id)
    queue_service.complete_token(db, token)
    await broadcast_queue(db, user.institution_id)
    return queue_service.token_out(db, token)


@router.post("/{token_id}/decline", response_model=TokenOut)
async def decline_token(
    token_id: int,
    payload: DeclineRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token = queue_service.get_owned_token(db, user.institution_id, token_id)
    queue_service.decline_token(db, token, payload.reason.strip())
    await broadcast_queue(db, user.institution_id)
    return queue_service.token_out(db, token)


@router.post("/{token_id}/no-show", response_model=TokenOut)
async def mark_no_show(
    token_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token = queue_service.get_owned_token(db, user.institution_id, token_id)
    queue_service.mark_no_show(db, token)
    await broadcast_queue(db, user.institution_id)
    return queue_service.token_out(db, token)
