from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

from fastapi import BackgroundTasks
from starlette.websockets import WebSocket


class RoomConnections:
    """Tracks open WebSocket connections grouped by room."""

    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def add(self, room_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._rooms.setdefault(room_id, set()).add(websocket)

    async def remove(self, room_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            connections = self._rooms.get(room_id)
            if connections is None:
                return
            connections.discard(websocket)
            if not connections:
                self._rooms.pop(room_id, None)

    async def broadcast(self, room_id: str, message: dict[str, Any]) -> None:
        async with self._lock:
            connections = list(self._rooms.get(room_id, ()))
        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception:
                await self.remove(room_id, websocket)


rooms = RoomConnections()


async def notify_room_updated(room_id: str) -> None:
    await rooms.broadcast(room_id, {"type": "room_updated"})


RoomNotify = Callable[[str], None]


def room_notifier(background_tasks: BackgroundTasks) -> RoomNotify:
    """Dependency yielding a callback that broadcasts a room update after commit.

    The broadcast is registered as a background task, which FastAPI runs after
    the response is sent and after the request's database session has been
    committed, so subscribers that re-fetch always read the new state.
    """

    def notify(room_id: str) -> None:
        background_tasks.add_task(notify_room_updated, room_id)

    return notify
