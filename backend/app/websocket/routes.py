from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websocket.manager import institution_id_from_token, manager

ws_router = APIRouter()


@ws_router.websocket("/ws/queue")
async def queue_websocket(websocket: WebSocket) -> None:
    institution_id = institution_id_from_token(websocket.query_params.get("token"))
    if institution_id is None:
        await websocket.close(code=1008)
        return
    await manager.connect(websocket, institution_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, institution_id)