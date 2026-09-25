from datetime import datetime
import logging

from fastapi import APIRouter, Depends, Query, HTTPException
from starlette.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models import Counter, Institution, Token, TokenStatus, User
from app.models.user import utcnow
from app.schemas.token import DeclineRequest, PriorityReview, TokenCreate, TokenOut, TokenPage
from app.services import queue_service, token_service
from app.services.broadcast import broadcast_queue
from app.services.token_copy import notify_token_copy

router = APIRouter(prefix="/tokens", tags=["tokens"])


@router.post("", response_model=TokenOut, status_code=201)
async def issue_token(
    payload: TokenCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    if payload.whatsapp_copy and user.role != "admin":
        raise HTTPException(status_code=403, detail="An admin must attest to customer consent")
    token, _position = token_service.issue_token(
        db,
        institution_id=user.institution_id,
        counter_id=payload.counter_id,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        customer_cnic=payload.customer_cnic,
        referral_source=payload.referral_source,
        referral_organization=payload.referral_organization,
        requested_priority=payload.requested_priority,
        priority_reason=payload.priority_reason,
    )
    out = queue_service.token_out(db, token)
    out.notification = await run_in_threadpool(
        notify_token_copy, consent=payload.whatsapp_copy, public=False,
        phone=token.customer_phone, token_number=token.token_number,
        counter_name=db.get(Counter, token.counter_id).name,
    )
    try:
        await broadcast_queue(db, user.institution_id)
    except Exception:
        # Issuance is committed; a cosmetic refresh must not invite a duplicate.
        logging.getLogger(__name__).warning("Queue broadcast failed after token issuance")
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


@router.post("/{token_id}/priority", response_model=TokenOut)
async def review_priority(token_id: int, payload: PriorityReview,
                          user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    token = queue_service.get_owned_token(db, user.institution_id, token_id)
    personnel = queue_service.get_caller_personnel(db, user.id, user.institution_id)
    if user.role != "admin" and not (user.role == "staff" and personnel and personnel.is_active):
        raise HTTPException(status_code=403, detail="Active linked staff or admin required")
    institution = db.get(Institution, user.institution_id)
    if (institution.type or "").strip().lower() != "hospital":
        raise HTTPException(status_code=403, detail="Priority review is hospital-only")
    queue_service.lock_counter(db, token)
    queue_service._require_status(token, TokenStatus.WAITING)
    if payload.decision == "approve" and token.requested_priority != "accessibility":
        raise HTTPException(status_code=409, detail="No accessibility request to approve")
    token.effective_priority = "accessibility" if payload.decision == "approve" else "normal"
    token.priority_review = {"approve": "approved", "reject": "rejected", "normal": "normal"}[payload.decision]
    token.priority_reviewed_by = user.id
    token.priority_reviewed_at = utcnow()
    db.commit()
    out = queue_service.token_out(db, token)
    try:
        await broadcast_queue(db, user.institution_id)
    except Exception:
        logging.getLogger(__name__).warning("Queue broadcast failed after priority review")
    return out


@router.post("/{token_id}/start", response_model=TokenOut)
async def start_service(
    token_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    token = queue_service.get_owned_token(db, user.institution_id, token_id)
    # A token can be started by a different staff member than the one who
    # called it (shift handover) — ownership follows whoever starts service.
    queue_service.start_service(db, token, user=user)
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
