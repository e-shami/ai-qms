from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models import User
from app.services import token_service
from app.services.prediction_service import active_queue_length, estimate_wait_minutes

router = APIRouter(prefix="/predictions", tags=["predictions"])


class WaitPredictionOut(BaseModel):
    counter_id: int
    queue_ahead: int
    estimated_wait_min: float


@router.get("/wait", response_model=WaitPredictionOut)
def predict_wait(
    counter_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WaitPredictionOut:
    """ML wait-time estimate for the next token at an owned, active counter."""
    counter = token_service.get_owned_counter(db, user.institution_id, counter_id)
    return WaitPredictionOut(
        counter_id=counter.id,
        queue_ahead=active_queue_length(db, counter.id),
        estimated_wait_min=estimate_wait_minutes(
            db, institution_id=user.institution_id, counter=counter
        ),
    )
