"""Notify the WebSocket Durable Object about a committed room mutation."""

import logging

from fastapi import Request

logger = logging.getLogger("sprintpoints")


async def notify_room(request: Request, room_id: str) -> None:
    env = request.scope.get("env")
    if env is None:
        return
    try:
        from workers import Request as WorkerRequest

        stub = env.ROOMS.getByName("main")
        await stub.fetch(
            WorkerRequest(f"https://room-hub.internal/broadcast/{room_id}", method="POST")
        )
    except Exception:
        logger.exception("room broadcast failed")
