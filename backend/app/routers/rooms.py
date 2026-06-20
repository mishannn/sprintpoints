from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Issue, Participant, Room
from ..schemas import CreateRoomRequest, JoinRoomRequest
from ..services import (
    DEFAULT_CARDS,
    build_room_state,
    generate_room_code,
    get_participant,
    get_room_by_code,
    new_id,
    new_token,
    normalize_code,
    now,
    serialize_participant,
    serialize_room,
    assert_member,
)


router = APIRouter(prefix="/api/rooms")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_room(payload: CreateRoomRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    timestamp = now()
    room_id = new_id()
    room_code = generate_room_code(db)
    host_token = new_token()
    participant_token = new_token()
    participant_id = new_id()
    issue_id = new_id()
    room_name = payload.room_name.strip() or payload.defaults.room_name
    participant_name = payload.participant_name.strip() or payload.defaults.facilitator_name

    room = Room(
        id=room_id,
        code=room_code,
        name=room_name,
        host_token=host_token,
        card_set=DEFAULT_CARDS,
        revealed=False,
        active_issue_id=issue_id,
        created_at=timestamp,
        updated_at=timestamp,
    )
    participant = Participant(
        id=participant_id,
        room_id=room_id,
        name=participant_name,
        token=participant_token,
        is_spectator=False,
        last_seen_at=timestamp,
        created_at=timestamp,
    )
    issue = Issue(
        id=issue_id,
        room_id=room_id,
        title=payload.defaults.first_story_title,
        description="",
        link="",
        position=1,
        estimate=None,
        archived_at=None,
        created_at=timestamp,
    )
    db.add_all([room, participant, issue])
    db.flush()

    state = build_room_state(db, room_id, participant_token, host_token)
    return {
        "hostToken": host_token,
        "participantToken": participant_token,
        "state": state,
        "participant": state["participants"][0],
    }


@router.post("/{code}/join", status_code=status.HTTP_201_CREATED)
def join_room(code: str, payload: JoinRoomRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not normalize_code(code) or not payload.name.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "joinRoomRequired")

    room = get_room_by_code(db, code)
    timestamp = now()
    participant_token = new_token()
    participant = Participant(
        id=new_id(),
        room_id=room.id,
        name=payload.name.strip(),
        token=participant_token,
        is_spectator=payload.is_spectator,
        last_seen_at=timestamp,
        created_at=timestamp,
    )
    db.add(participant)
    db.flush()
    participant = get_participant(db, participant.id)
    return {
        "room": serialize_room(room),
        "participant": serialize_participant(participant, participant_token),
        "participantToken": participant_token,
    }


@router.get("/{code}")
def load_room(
    code: str,
    db: Session = Depends(get_db),
    x_participant_token: str | None = Header(default=None),
    x_host_token: str | None = Header(default=None),
) -> dict[str, Any]:
    room = get_room_by_code(db, code)
    assert_member(db, room.id, x_participant_token, x_host_token)
    return build_room_state(db, room.id, x_participant_token, x_host_token)
