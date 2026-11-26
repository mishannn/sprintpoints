"""Token comparison, header annotations and access checks."""

import hmac
from typing import Annotated

from fastapi import Header, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import ADMIN_HEADER, HOST_HEADER, PARTICIPANT_HEADER, setting
from errors import forbidden, not_found
from models import Participant, Room

HostToken = Annotated[str | None, Header(alias=HOST_HEADER)]
ParticipantToken = Annotated[str | None, Header(alias=PARTICIPANT_HEADER)]
AdminToken = Annotated[str | None, Header(alias=ADMIN_HEADER)]


def token_eq(left: str | None, right: str | None) -> bool:
    return bool(left and right and hmac.compare_digest(left, right))


def require_host(db: Session, room_id: str, token: str | None) -> Room:
    room = db.get(Room, room_id)
    if room is None:
        raise not_found("roomNotFound")
    if not token_eq(token, room.host_token):
        raise forbidden("hostAccessDenied")
    return room


def require_participant(db: Session, participant_id: str, token: str | None) -> Participant:
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise not_found("participantNotFound")
    if not token_eq(token, participant.token):
        raise forbidden("participantAccessDenied")
    return participant


def require_member(
    db: Session, room: Room, participant_token: str | None, host_token: str | None
) -> None:
    if token_eq(host_token, room.host_token):
        return
    if participant_token and db.scalar(
        select(Participant.id).where(
            Participant.room_id == room.id, Participant.token == participant_token
        )
    ):
        return
    raise forbidden("roomAccessDenied")


def require_admin(request: Request, token: str | None) -> None:
    expected = setting(request, "ADMIN_TOKEN")
    if not expected:
        raise not_found("Not Found")
    if not token_eq(token, expected):
        raise forbidden("adminAccessDenied")
