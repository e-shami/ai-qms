"""WebSocket broadcast helpers.

Every frame leaving the server is a tagged envelope so clients can route
payloads by kind. Untagged frames from older deployments are still
accepted client-side (they fall back to the queue handler).
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.services import presence_service, queue_service
from app.websocket.manager import manager


async def broadcast_queue(db: Session, institution_id: int) -> None:
    snapshot = queue_service.snapshot(db, institution_id).model_dump(mode="json")
    await manager.broadcast(institution_id, {"event": "queue", "data": snapshot})


async def broadcast_presence(db: Session, institution_id: int) -> None:
    await manager.broadcast(
        institution_id,
        {
            "event": "presence",
            "data": {
                "entries": [
                    entry.model_dump(mode="json")
                    for entry in presence_service.roster(db, institution_id)
                ]
            },
        },
    )


async def broadcast_all(db: Session, institution_id: int) -> None:
    """Queue and presence move together on counter/staff mutations."""
    await broadcast_queue(db, institution_id)
    await broadcast_presence(db, institution_id)
