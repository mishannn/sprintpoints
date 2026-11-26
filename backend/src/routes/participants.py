"""Participant heartbeat, spectator toggle and removal."""

from fastapi import APIRouter, Request, Response
from sqlalchemy import delete

from clock import now
from db import Db
from errors import not_found
from events import notify_room
from models import Participant, Room, Vote
from schemas import ParticipantIn
from security import HostToken, ParticipantToken, require_host, require_participant
from views import participant_view

router = APIRouter()


@router.post("/participants/{participant}/heartbeat", status_code=204)
async def heartbeat(
    participant: str, db: Db, participant_token: ParticipantToken = None
):
    found = require_participant(db, participant, participant_token)
    found.last_seen_at = now()
    db.commit()
    return Response(status_code=204)


@router.patch("/participants/{participant}")
async def update_participant(
    participant: str,
    body: ParticipantIn,
    request: Request,
    db: Db,
    participant_token: ParticipantToken = None,
):
    found = require_participant(db, participant, participant_token)
    found.is_spectator = 1 if body.isSpectator else 0
    if found.is_spectator:
        room = db.get(Room, found.room_id)
        if room and room.active_issue_id:
            db.execute(
                delete(Vote).where(
                    Vote.issue_id == room.active_issue_id,
                    Vote.participant_id == found.id,
                )
            )
    db.commit()
    await notify_room(request, found.room_id)
    return participant_view(found, participant_token)


@router.delete("/rooms/{room}/participants/{participant}", status_code=204)
async def remove_participant(
    room: str,
    participant: str,
    request: Request,
    db: Db,
    host_token: HostToken = None,
):
    found = require_host(db, room, host_token)
    member = db.get(Participant, participant)
    if member is None or member.room_id != found.id:
        raise not_found("participantNotFound")
    db.delete(member)
    db.execute(delete(Vote).where(Vote.participant_id == member.id))
    db.commit()
    await notify_room(request, found.id)
    return Response(status_code=204)
