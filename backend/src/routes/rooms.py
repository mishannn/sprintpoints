"""Room lifecycle, membership and facilitator room actions."""

import json

from fastapi import APIRouter, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from clock import now
from config import CARD_SET, MAX_ROOM_CODE_ATTEMPTS
from db import Db
from errors import ApiError, not_found
from events import notify_room
from identity import new_code, new_id, new_token, normalize_code
from models import Issue, Participant, Room
from schemas import ActiveIssueIn, CreateRoomIn, JoinIn, TransferIn
from security import HostToken, ParticipantToken, require_host, require_member
from views import participant_view, room_state, room_view

router = APIRouter()


def allocate_code(db: Session) -> str:
    for _ in range(MAX_ROOM_CODE_ATTEMPTS):
        code = new_code()
        if db.scalar(select(Room.id).where(Room.code == code)) is None:
            return code
    raise ApiError(503, "roomCodeUnavailable")


@router.post("/rooms", status_code=201)
async def create_room(body: CreateRoomIn, db: Db):
    timestamp = now()
    room_id, participant_id, issue_id = new_id(), new_id(), new_id()
    host_token, participant_token = new_token(), new_token()
    room = Room(
        id=room_id,
        code=allocate_code(db),
        name=body.roomName.strip() or body.defaults.roomName,
        host_token=host_token,
        owner_id=participant_id,
        card_set=json.dumps(CARD_SET, separators=(",", ":")),
        revealed=0,
        active_issue_id=issue_id,
        created_at=timestamp,
        updated_at=timestamp,
    )
    participant = Participant(
        id=participant_id,
        room_id=room_id,
        name=body.participantName.strip() or body.defaults.facilitatorName,
        token=participant_token,
        is_spectator=0,
        last_seen_at=timestamp,
        created_at=timestamp,
    )
    issue = Issue(
        id=issue_id,
        room_id=room_id,
        title=body.defaults.firstStoryTitle,
        description="",
        link="",
        position=1,
        estimate=None,
        archived_at=None,
        created_at=timestamp,
    )
    db.add_all([room, participant, issue])
    db.commit()
    return {
        "hostToken": host_token,
        "participantToken": participant_token,
        "state": room_state(db, room, participant_token, host_token),
        "participant": participant_view(participant, participant_token),
    }


@router.post("/rooms/{room}/join", status_code=201)
async def join_room(room: str, body: JoinIn, request: Request, db: Db):
    code = normalize_code(room)
    name = body.name.strip()
    if not code or not name:
        raise ApiError(400, "joinRoomRequired")
    found = db.scalar(select(Room).where(Room.code == code))
    if found is None:
        raise not_found("roomNotFound")

    timestamp = now()
    participant = Participant(
        id=new_id(),
        room_id=found.id,
        name=name,
        token=new_token(),
        is_spectator=1 if body.isSpectator else 0,
        last_seen_at=timestamp,
        created_at=timestamp,
    )
    db.add(participant)
    db.commit()
    await notify_room(request, found.id)
    return {
        "room": room_view(found, False),
        "participant": participant_view(participant, participant.token),
        "participantToken": participant.token,
    }


@router.get("/rooms/{room}")
async def load_room(
    room: str,
    db: Db,
    participant_token: ParticipantToken = None,
    host_token: HostToken = None,
):
    found = db.scalar(select(Room).where(Room.code == normalize_code(room)))
    if found is None:
        raise not_found("roomNotFound")
    require_member(db, found, participant_token, host_token)
    return room_state(db, found, participant_token, host_token)


@router.post("/rooms/{room}/transfer-ownership", status_code=204)
async def transfer_ownership(
    room: str,
    body: TransferIn,
    request: Request,
    db: Db,
    host_token: HostToken = None,
):
    found = require_host(db, room, host_token)
    participant = db.get(Participant, body.participantId)
    if participant is None or participant.room_id != found.id:
        raise not_found("participantNotFound")
    found.host_token = new_token()
    found.owner_id = participant.id
    found.updated_at = now()
    db.commit()
    await notify_room(request, found.id)
    return Response(status_code=204)


@router.patch("/rooms/{room}/active-issue", status_code=204)
async def set_active_issue(
    room: str,
    body: ActiveIssueIn,
    request: Request,
    db: Db,
    host_token: HostToken = None,
):
    found = require_host(db, room, host_token)
    if body.issueId is not None:
        target = db.get(Issue, body.issueId)
        if target is None or target.room_id != found.id:
            raise not_found("storyNotFound")
    found.active_issue_id = body.issueId
    found.revealed = 0
    found.updated_at = now()
    db.commit()
    await notify_room(request, found.id)
    return Response(status_code=204)


@router.patch("/rooms/{room}/reveal", status_code=204)
async def reveal(room: str, request: Request, db: Db, host_token: HostToken = None):
    found = require_host(db, room, host_token)
    found.revealed = 1
    found.updated_at = now()
    db.commit()
    await notify_room(request, found.id)
    return Response(status_code=204)
