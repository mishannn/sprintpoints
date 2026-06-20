from __future__ import annotations

import secrets
import string
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Issue, Participant, Room, Vote


DEFAULT_CARDS = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "Coffee"]
CODE_ALPHABET = string.ascii_uppercase + string.digits


def now() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid.uuid4())


def new_token() -> str:
    return secrets.token_urlsafe(32)


def normalize_code(code: str) -> str:
    return code.strip().upper()


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat().replace("+00:00", "Z")


def serialize_room(room: Room, host_token: str | None = None) -> dict[str, Any]:
    return {
        "id": room.id,
        "code": room.code,
        "name": room.name,
        "host_token": room.host_token if host_token and secrets.compare_digest(host_token, room.host_token) else "",
        "card_set": room.card_set,
        "revealed": room.revealed,
        "active_issue_id": room.active_issue_id,
        "created_at": iso(room.created_at),
        "updated_at": iso(room.updated_at),
    }


def serialize_participant(participant: Participant, participant_token: str | None = None) -> dict[str, Any]:
    return {
        "id": participant.id,
        "room_id": participant.room_id,
        "name": participant.name,
        "token": participant.token if participant_token and secrets.compare_digest(participant_token, participant.token) else "",
        "is_spectator": participant.is_spectator,
        "last_seen_at": iso(participant.last_seen_at),
        "created_at": iso(participant.created_at),
    }


def serialize_issue(issue: Issue) -> dict[str, Any]:
    return {
        "id": issue.id,
        "room_id": issue.room_id,
        "title": issue.title,
        "description": issue.description,
        "link": issue.link,
        "position": issue.position,
        "estimate": issue.estimate,
        "archived_at": iso(issue.archived_at),
        "created_at": iso(issue.created_at),
    }


def serialize_vote(vote: Vote) -> dict[str, Any]:
    return {
        "id": vote.id,
        "room_id": vote.room_id,
        "issue_id": vote.issue_id,
        "participant_id": vote.participant_id,
        "value": vote.value,
        "created_at": iso(vote.created_at),
        "updated_at": iso(vote.updated_at),
    }


def get_room(db: Session, room_id: str) -> Room:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "roomNotFound")
    return room


def get_room_by_code(db: Session, code: str) -> Room:
    room = db.scalar(select(Room).where(Room.code == normalize_code(code)))
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "roomNotFound")
    return room


def get_issue(db: Session, issue_id: str) -> Issue:
    issue = db.get(Issue, issue_id)
    if issue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "storyNotFound")
    return issue


def get_participant(db: Session, participant_id: str) -> Participant:
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "participantNotFound")
    return participant


def assert_member(db: Session, room_id: str, participant_token: str | None, host_token: str | None) -> None:
    room = get_room(db, room_id)
    if host_token and secrets.compare_digest(host_token, room.host_token):
        return

    if participant_token:
        participant = db.scalar(
            select(Participant).where(Participant.room_id == room_id, Participant.token == participant_token)
        )
        if participant is not None:
            return

    raise HTTPException(status.HTTP_403_FORBIDDEN, "roomAccessDenied")


def assert_host(db: Session, room_id: str, host_token: str | None) -> None:
    room = get_room(db, room_id)
    if host_token and secrets.compare_digest(host_token, room.host_token):
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "hostAccessDenied")


def assert_participant_token(db: Session, participant_id: str, token: str | None) -> Participant:
    participant = get_participant(db, participant_id)
    if token and secrets.compare_digest(token, participant.token):
        return participant
    raise HTTPException(status.HTTP_403_FORBIDDEN, "participantAccessDenied")


def build_room_state(
    db: Session,
    room_id: str,
    participant_token: str | None = None,
    host_token: str | None = None,
) -> dict[str, Any]:
    room = get_room(db, room_id)
    participants = db.scalars(
        select(Participant).where(Participant.room_id == room_id).order_by(Participant.created_at)
    ).all()
    issues = db.scalars(select(Issue).where(Issue.room_id == room_id).order_by(Issue.position, Issue.created_at)).all()
    votes = db.scalars(select(Vote).where(Vote.room_id == room_id)).all()
    return {
        "room": serialize_room(room, host_token),
        "participants": [serialize_participant(participant, participant_token) for participant in participants],
        "issues": [serialize_issue(issue) for issue in issues],
        "votes": [serialize_vote(vote) for vote in votes],
    }


def generate_room_code(db: Session) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        exists = db.scalar(select(Room.id).where(Room.code == code))
        if exists is None:
            return code
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "roomCodeUnavailable")


def next_position(db: Session, room_id: str) -> int:
    value = db.scalar(select(func.coalesce(func.max(Issue.position), 0) + 1).where(Issue.room_id == room_id))
    return int(value or 1)
