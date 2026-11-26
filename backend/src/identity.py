"""Identifiers, tokens and room codes."""

import secrets
import uuid

from config import ALPHABET, ROOM_CODE_LENGTH


def new_id() -> str:
    return str(uuid.uuid4())


def new_token() -> str:
    return secrets.token_urlsafe(32)


def new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(ROOM_CODE_LENGTH))


def normalize_code(value: str | None) -> str:
    return (value or "").strip().upper()
