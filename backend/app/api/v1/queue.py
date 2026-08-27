from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.queue import QueueSnapshot
from app.services import queue_service

router = APIRouter(prefix="/queue", tags=["queue"])


@router.get("", response_model=QueueSnapshot)
def get_queue(
    counter_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QueueSnapshot:
    return queue_service.snapshot(db, user.institution_id, counter_id=counter_id)