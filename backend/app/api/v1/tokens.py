from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models import Counter, Token, TokenStatus, User
from app.schemas.token import TokenCreate, TokenOut
from app.services import queue_service, token_service
from app.websocket.manager import manager

router = APIRouter(prefix="/tokens", tags=["tokens"])


async def _broadcast_queue(db: Session, institution_id: int) -> None:
    snapshot = queue_service.snapshot(db, institution_id).model_dump(mode="json")
    await manager.broadcast(institution_id, snapshot)


@router.post("", response_model=TokenOut, status_code=201)
async def issue_token(
    payload: TokenCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token, position = token_service.issue_token(
        db,
        institution_id=user.institution_id,
        counter_id=payload.counter_id,
        customer_name=payload.customer_name,
    )
    await _broadcast_queue(db, user.institution_id)
    return TokenOut.model_validate(token).model_copy(update={"position": position})


@router.get("", response_model=list[TokenOut])
def list_tokens(
    counter_id: int | None = None,
    status: TokenStatus | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TokenOut]:
    query = select(Token).where(Token.institution_id == user.institution_id)
    if counter_id is not None:
        token_service.get_owned_counter(db, user.institution_id, counter_id, active_only=False)
        query = query.where(Token.counter_id == counter_id)
    if status is not None:
        query = query.where(Token.status == status)
    tokens = db.execute(query.order_by(Token.issued_at.desc(), Token.id.desc())).scalars().all()
    return [queue_service.token_out(db, token) for token in tokens]


@router.post("/{token_id}/call", response_model=TokenOut)
async def call_token(
    token_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token = queue_service.get_owned_token(db, user.institution_id, token_id)
    queue_service.call_token(db, token)
    await _broadcast_queue(db, user.institution_id)
    return queue_service.token_out(db, token)


@router.post("/{token_id}/start", response_model=TokenOut)
async def start_service(
    token_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token = queue_service.get_owned_token(db, user.institution_id, token_id)
    queue_service.start_service(db, token)
    await _broadcast_queue(db, user.institution_id)
    return queue_service.token_out(db, token)


@router.post("/{token_id}/complete", response_model=TokenOut)
async def complete_token(
    token_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token = queue_service.get_owned_token(db, user.institution_id, token_id)
    queue_service.complete_token(db, token)
    await _broadcast_queue(db, user.institution_id)
    return queue_service.token_out(db, token)


@router.post("/{token_id}/no-show", response_model=TokenOut)
async def mark_no_show(
    token_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token = queue_service.get_owned_token(db, user.institution_id, token_id)
    queue_service.mark_no_show(db, token)
    await _broadcast_queue(db, user.institution_id)
    return queue_service.token_out(db, token)