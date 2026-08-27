from __future__ import annotations

import jwt
from fastapi import WebSocket

from app.utils.security import decode_token


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, institution_id: int) -> None:
        await websocket.accept()
        self._connections.setdefault(institution_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, institution_id: int) -> None:
        connections = self._connections.get(institution_id)
        if connections is None:
            return
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self._connections.pop(institution_id, None)

    async def broadcast(self, institution_id: int, message: dict) -> None:
        for websocket in list(self._connections.get(institution_id, [])):
            try:
                await websocket.send_json(message)
            except Exception:
                self.disconnect(websocket, institution_id)


manager = ConnectionManager()


def institution_id_from_token(token: str | None) -> int | None:
    if not token:
        return None
    try:
        payload = decode_token(token)
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
    if payload.get("type") != "access":
        return None
    try:
        return int(payload["institution_id"])
    except (KeyError, TypeError, ValueError):
        return None