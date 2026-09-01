from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from app.api.deps import get_db, get_current_user, verify_internal_api_key
from app.models import Counter
from app.config import settings

router = APIRouter(prefix="/cv", tags=["computer-vision"])


class CVQueueUpdate(BaseModel):
    counter_id: int = Field(..., description="Counter ID (matches Counter.id)")
    queue_length: int = Field(..., ge=0, description="Number of people detected in ROI")
    service_rate: float = Field(..., ge=0, description="People served per minute")
    estimated_wait_min: float = Field(..., ge=0, description="Estimated wait time in minutes")
    avg_dwell_time: float = Field(..., ge=0, description="Average dwell time in seconds")
    timestamp: float = Field(..., description="Unix timestamp of the measurement")


class CVQueueUpdateResponse(BaseModel):
    success: bool
    counter_id: int
    queue_length: int
    message: str


@router.post("/queue-update", response_model=CVQueueUpdateResponse, status_code=status.HTTP_200_OK)
async def cv_queue_update(
    payload: CVQueueUpdate,
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_internal_api_key),
):
    """
    Receive queue updates from CV service.
    Authenticated via X-Internal-API-Key header.
    """
    # Verify counter exists
    counter = db.query(Counter).filter(Counter.id == payload.counter_id).first()
    if not counter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Counter {payload.counter_id} not found"
        )

    # Update counter's live queue length from CV
    counter.cv_queue_length = payload.queue_length
    counter.cv_service_rate = payload.service_rate
    counter.cv_last_update = datetime.fromtimestamp(payload.timestamp)
    counter.cv_estimated_wait_min = payload.estimated_wait_min

    db.commit()

    # Broadcast to WebSocket subscribers (queue update event)
    from app.websocket.manager import manager
    await manager.broadcast(
        counter.institution_id,
        {
            "event": "cv_update",
            "data": {
                "counter_id": counter.id,
                "counter_name": counter.name,
                "queue_length": payload.queue_length,
                "service_rate": payload.service_rate,
                "estimated_wait_min": payload.estimated_wait_min,
                "timestamp": payload.timestamp,
            }
        }
    )

    return CVQueueUpdateResponse(
        success=True,
        counter_id=payload.counter_id,
        queue_length=payload.queue_length,
        message="CV queue update received and broadcasted"
    )


@router.get("/counters/{counter_id}/cv-status")
async def get_cv_status(
    counter_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Get current CV status for a counter."""
    counter = db.query(Counter).filter(
        Counter.id == counter_id,
        Counter.institution_id == current_user.institution_id
    ).first()

    if not counter:
        raise HTTPException(status_code=404, detail="Counter not found")

    return {
        "counter_id": counter.id,
        "cv_queue_length": counter.cv_queue_length,
        "cv_service_rate": counter.cv_service_rate,
        "cv_estimated_wait_min": counter.cv_estimated_wait_min,
        "cv_last_update": counter.cv_last_update,
        "cv_enabled": counter.cv_enabled,
    }