"""Row-to-JSON shaping, including token visibility rules."""

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from clock import fmt
from models import Issue, Participant, Room, Vote
from security import token_eq


def room_view(room: Room, reveal_host_token: bool):
    try:
        cards = json.loads(room.card_set or "[]")
    except ValueError:
        cards = []
    return {
        "id": room.id,
        "code": room.code,
        "name": room.name,
        "host_token": room.host_token if reveal_host_token else "",
        "owner_id": room.owner_id,
        "card_set": cards if isinstance(cards, list) else [],
        "revealed": bool(room.revealed),
        "active_issue_id": room.active_issue_id,
        "created_at": fmt(room.created_at) or "",
        "updated_at": fmt(room.updated_at) or "",
    }


def participant_view(participant: Participant, request_token: str | None):
    return {
        "id": participant.id,
        "room_id": participant.room_id,
        "name": participant.name,
        "token": participant.token if token_eq(request_token, participant.token) else "",
        "is_spectator": bool(participant.is_spectator),
        "last_seen_at": fmt(participant.last_seen_at) or "",
        "created_at": fmt(participant.created_at) or "",
    }


def issue_view(issue: Issue):
    return {
        "id": issue.id,
        "room_id": issue.room_id,
        "title": issue.title,
        "description": issue.description or "",
        "link": issue.link or "",
        "position": int(issue.position),
        "estimate": issue.estimate,
        "archived_at": fmt(issue.archived_at),
        "created_at": fmt(issue.created_at) or "",
    }


def vote_view(vote: Vote):
    return {
        "id": vote.id,
        "room_id": vote.room_id,
        "issue_id": vote.issue_id,
        "participant_id": vote.participant_id,
        "value": vote.value,
        "created_at": fmt(vote.created_at) or "",
        "updated_at": fmt(vote.updated_at) or "",
    }


def room_state(
    db: Session, room: Room, participant_token: str | None, host_token: str | None
):
    participants = db.scalars(
        select(Participant)
        .where(Participant.room_id == room.id)
        .order_by(Participant.created_at, Participant.id)
    ).all()
    issues = db.scalars(
        select(Issue)
        .where(Issue.room_id == room.id)
        .order_by(Issue.position, Issue.created_at, Issue.id)
    ).all()
    votes = db.scalars(select(Vote).where(Vote.room_id == room.id)).all()

    reveal_host = token_eq(host_token, room.host_token)
    if not reveal_host and room.owner_id:
        reveal_host = any(
            participant.id == room.owner_id
            and token_eq(participant_token, participant.token)
            for participant in participants
        )

    return {
        "room": room_view(room, reveal_host),
        "participants": [participant_view(p, participant_token) for p in participants],
        "issues": [issue_view(issue) for issue in issues],
        "votes": [vote_view(vote) for vote in votes],
    }


def row_dict(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}
