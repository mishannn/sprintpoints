"""Static API configuration and per-request Worker settings."""

from fastapi import Request

CARD_SET = ("0", "1", "2", "3", "5", "8", "13", "21", "?", "Coffee")
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
ROOM_CODE_LENGTH = 6
MAX_ROOM_CODE_ATTEMPTS = 20

HOST_HEADER = "X-Host-Token"
PARTICIPANT_HEADER = "X-Participant-Token"
ADMIN_HEADER = "X-Admin-Token"

ROOM_UPDATED = '{"type":"room_updated"}'
ALLOWED_METHODS = "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS"
ALLOWED_HEADERS = f"{HOST_HEADER},{PARTICIPANT_HEADER},Origin,Content-Type"


def setting(request: Request, name: str, default=None):
    """Read a Worker binding/variable, falling back to app.state for tests."""
    env = request.scope.get("env")
    if env is not None:
        value = getattr(env, name, None)
        if value is not None:
            return value
    return getattr(request.app.state, name, default)
