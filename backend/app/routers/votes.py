from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Vote
from ..schemas import VoteRequest
from ..services import (
    assert_host,
    assert_participant_token,
    get_issue,
    get_room,
    new_id,
    now,
)


router = APIRouter(prefix="/api")


@router.put("/rooms/{room_id}/issues/{issue_id}/votes/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def submit_vote(
    room_id: str,
    issue_id: str,
    participant_id: str,
    payload: VoteRequest,
    db: Session = Depends(get_db),
    x_participant_token: str | None = Header(default=None),
) -> Response:
    participant = assert_participant_token(db, participant_id, x_participant_token)
    issue = get_issue(db, issue_id)
    if participant.room_id != room_id or issue.room_id != room_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "roomNotFound")
    if participant.is_spectator:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "spectatorsCannotVote")

    timestamp = now()
    vote = db.scalar(select(Vote).where(Vote.issue_id == issue_id, Vote.participant_id == participant_id))
    if vote is None:
        vote = Vote(
            id=new_id(),
            room_id=room_id,
            issue_id=issue_id,
            participant_id=participant_id,
            value=payload.value,
            created_at=timestamp,
            updated_at=timestamp,
        )
        db.add(vote)
    else:
        vote.value = payload.value
        vote.updated_at = timestamp

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/rooms/{room_id}/reveal", status_code=status.HTTP_204_NO_CONTENT)
def reveal_votes(
    room_id: str,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> Response:
    assert_host(db, room_id, x_host_token)
    room = get_room(db, room_id)
    room.revealed = True
    room.updated_at = now()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/rooms/{room_id}/issues/{issue_id}/reset-votes", status_code=status.HTTP_204_NO_CONTENT)
def reset_votes(
    room_id: str,
    issue_id: str,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> Response:
    assert_host(db, room_id, x_host_token)
    issue = get_issue(db, issue_id)
    if issue.room_id != room_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "storyNotFound")
    db.execute(delete(Vote).where(Vote.issue_id == issue_id))
    room = get_room(db, room_id)
    room.revealed = False
    room.updated_at = now()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/issues/{issue_id}/votes/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_participant_vote(
    issue_id: str,
    participant_id: str,
    db: Session = Depends(get_db),
    x_participant_token: str | None = Header(default=None),
) -> Response:
    participant = assert_participant_token(db, participant_id, x_participant_token)
    issue = get_issue(db, issue_id)
    if participant.room_id != issue.room_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "roomNotFound")
    db.execute(delete(Vote).where(Vote.issue_id == issue_id, Vote.participant_id == participant_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
