from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Response, status, HTTPException
from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Vote
from ..schemas import ParticipantModeRequest
from ..services import (
    assert_host,
    assert_participant_token,
    get_participant,
    get_room,
    now,
    serialize_participant,
)


router = APIRouter(prefix="/api")


@router.post("/participants/{participant_id}/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
def participant_heartbeat(
    participant_id: str,
    db: Session = Depends(get_db),
    x_participant_token: str | None = Header(default=None),
) -> Response:
    participant = assert_participant_token(db, participant_id, x_participant_token)
    participant.last_seen_at = now()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/participants/{participant_id}")
def update_participant(
    participant_id: str,
    payload: ParticipantModeRequest,
    db: Session = Depends(get_db),
    x_participant_token: str | None = Header(default=None),
) -> dict[str, Any]:
    participant = assert_participant_token(db, participant_id, x_participant_token)
    participant.is_spectator = payload.is_spectator
    if payload.is_spectator:
        active_issue_id = get_room(db, participant.room_id).active_issue_id
        if active_issue_id:
            db.execute(delete(Vote).where(Vote.issue_id == active_issue_id, Vote.participant_id == participant_id))
    db.flush()
    return serialize_participant(get_participant(db, participant_id), x_participant_token)


@router.delete("/rooms/{room_id}/participants/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_participant(
    room_id: str,
    participant_id: str,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> Response:
    assert_host(db, room_id, x_host_token)
    participant = get_participant(db, participant_id)
    if participant.room_id != room_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "participantNotFound")
    db.delete(participant)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
