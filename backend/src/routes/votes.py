"""Voting: cast/delete a vote and reset voting for an issue."""

from fastapi import APIRouter, Request, Response
from sqlalchemy import delete
from sqlalchemy.dialects.sqlite import insert

from clock import now
from db import Db
from errors import forbidden, not_found
from events import notify_room
from identity import new_id
from models import Issue, Vote
from schemas import ValueIn
from security import HostToken, ParticipantToken, require_host, require_participant

router = APIRouter()


@router.put("/rooms/{room}/issues/{issue}/votes/{participant}", status_code=204)
async def cast_vote(
    room: str,
    issue: str,
    participant: str,
    body: ValueIn,
    request: Request,
    db: Db,
    participant_token: ParticipantToken = None,
):
    voter = require_participant(db, participant, participant_token)
    target = db.get(Issue, issue)
    if voter.room_id != room or target is None or target.room_id != room:
        raise not_found("roomNotFound")
    if voter.is_spectator:
        raise forbidden("spectatorsCannotVote")
    timestamp = now()
    db.execute(
        insert(Vote)
        .values(
            id=new_id(),
            room_id=voter.room_id,
            issue_id=target.id,
            participant_id=voter.id,
            value=body.value,
            created_at=timestamp,
            updated_at=timestamp,
        )
        .on_conflict_do_update(
            index_elements=[Vote.issue_id, Vote.participant_id],
            set_={"value": body.value, "updated_at": timestamp},
        )
    )
    db.commit()
    await notify_room(request, voter.room_id)
    return Response(status_code=204)


@router.post("/rooms/{room}/issues/{issue}/reset-votes", status_code=204)
async def reset_votes(
    room: str,
    issue: str,
    request: Request,
    db: Db,
    host_token: HostToken = None,
):
    found = require_host(db, room, host_token)
    target = db.get(Issue, issue)
    if target is None or target.room_id != found.id:
        raise not_found("storyNotFound")
    db.execute(delete(Vote).where(Vote.issue_id == target.id))
    found.revealed = 0
    found.updated_at = now()
    db.commit()
    await notify_room(request, found.id)
    return Response(status_code=204)


@router.delete("/issues/{issue}/votes/{participant}", status_code=204)
async def delete_vote(
    issue: str,
    participant: str,
    request: Request,
    db: Db,
    participant_token: ParticipantToken = None,
):
    voter = require_participant(db, participant, participant_token)
    target = db.get(Issue, issue)
    if target is None or target.room_id != voter.room_id:
        raise not_found("roomNotFound")
    db.execute(
        delete(Vote).where(
            Vote.issue_id == target.id, Vote.participant_id == voter.id
        )
    )
    db.commit()
    await notify_room(request, voter.room_id)
    return Response(status_code=204)
