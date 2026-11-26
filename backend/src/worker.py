"""Cloudflare entrypoint: FastAPI over D1 and a Durable Object for live updates."""

import re
from urllib.parse import parse_qs, unquote, urlparse

from js import WebSocketPair
from workers import DurableObject, Request, Response, WorkerEntrypoint, asgi

from app import app
from config import ROOM_UPDATED
from security import token_eq

WS_PATH = re.compile(r"^/api/rooms/([^/]+)/ws/?$")


class Default(WorkerEntrypoint):
    async def fetch(self, request: Request):
        if WS_PATH.match(urlparse(request.url).path):
            return await self.env.ROOMS.getByName("main").fetch(request)
        return await asgi.fetch(app, request, self.env, self.ctx)


class RoomHub(DurableObject):
    async def fetch(self, request: Request):
        url = urlparse(request.url)

        if url.path.startswith("/broadcast/"):
            room_id = unquote(url.path.rsplit("/", 1)[-1])
            for socket in self.ctx.getWebSockets():
                try:
                    if socket.deserializeAttachment() == room_id:
                        socket.send(ROOM_UPDATED)
                except Exception:
                    continue
            return Response(None, status=204)

        match = WS_PATH.match(url.path)
        if match is None:
            return Response("Not Found", status=404)
        if (request.headers.get("upgrade") or "").lower() != "websocket":
            return Response("Expected WebSocket upgrade", status=426)

        room_id = match.group(1)
        query = parse_qs(url.query)
        if not await self.authorized(
            room_id,
            query.get("participantToken", [None])[0],
            query.get("hostToken", [None])[0],
        ):
            return Response("Room access denied", status=403)

        client, server = WebSocketPair.new().object_values()
        server.serializeAttachment(room_id)
        self.ctx.acceptWebSocket(server)
        return Response(None, status=101, web_socket=client)

    async def authorized(
        self,
        room_id: str,
        participant_token: str | None,
        host_token: str | None,
    ) -> bool:
        room = await (
            self.env.DB.prepare("SELECT host_token FROM rooms WHERE id = ?")
            .bind(room_id)
            .first()
        )
        if room is None:
            return False
        if token_eq(host_token, room.get("host_token")):
            return True
        if participant_token:
            participant = await (
                self.env.DB.prepare(
                    "SELECT id FROM participants WHERE room_id = ? AND token = ?"
                )
                .bind(room_id, participant_token)
                .first()
            )
            return participant is not None
        return False

    async def webSocketMessage(self, socket, message):
        pass

    async def webSocketClose(self, socket, code, reason, was_clean):
        pass

    async def webSocketError(self, socket, error):
        pass
