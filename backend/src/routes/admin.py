"""Admin export/import of the four D1 tables."""

import json

from fastapi import APIRouter, Request
from sqlalchemy import delete, select

from db import Db
from errors import ApiError
from models import Issue, Participant, Room, Vote
from security import AdminToken, require_admin
from views import row_dict

router = APIRouter()


@router.get("/admin/export")
async def admin_export(request: Request, db: Db, admin_token: AdminToken = None):
    require_admin(request, admin_token)
    return {
        "rooms": [
            row_dict(row)
            for row in db.scalars(select(Room).order_by(Room.created_at)).all()
        ],
        "participants": [
            row_dict(row)
            for row in db.scalars(
                select(Participant).order_by(Participant.created_at)
            ).all()
        ],
        "issues": [
            row_dict(row)
            for row in db.scalars(select(Issue).order_by(Issue.position)).all()
        ],
        "votes": [
            row_dict(row)
            for row in db.scalars(select(Vote).order_by(Vote.created_at)).all()
        ],
    }


@router.post("/admin/import")
async def admin_import(request: Request, db: Db, admin_token: AdminToken = None):
    require_admin(request, admin_token)
    try:
        payload = await request.json()
    except Exception:
        raise ApiError(422, "invalid request body") from None
    if not isinstance(payload, dict):
        raise ApiError(422, "invalid request body")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload

    rooms = data.get("rooms") if isinstance(data.get("rooms"), list) else []
    participants = (
        data.get("participants") if isinstance(data.get("participants"), list) else []
    )
    issues = data.get("issues") if isinstance(data.get("issues"), list) else []
    votes = data.get("votes") if isinstance(data.get("votes"), list) else []

    room_ids = {room.get("id") for room in rooms}
    for participant in participants:
        if participant.get("room_id") not in room_ids:
            raise ApiError(
                400,
                f"participant {participant.get('id')} points at an unknown room",
            )
    for issue in issues:
        if issue.get("room_id") not in room_ids:
            raise ApiError(400, f"issue {issue.get('id')} points at an unknown room")
    participant_ids = {participant.get("id") for participant in participants}
    issue_ids = {issue.get("id") for issue in issues}
    for vote in votes:
        if vote.get("room_id") not in room_ids:
            raise ApiError(400, f"vote {vote.get('id')} points at an unknown room")
        if vote.get("issue_id") not in issue_ids:
            raise ApiError(400, f"vote {vote.get('id')} points at an unknown story")
        if vote.get("participant_id") not in participant_ids:
            raise ApiError(
                400, f"vote {vote.get('id')} points at an unknown participant"
            )

    db.execute(delete(Vote))
    db.execute(delete(Issue))
    db.execute(delete(Participant))
    db.execute(delete(Room))

    for room in rooms:
        card_set = room.get("card_set")
        if not isinstance(card_set, str):
            card_set = json.dumps(card_set or [], separators=(",", ":"))
        db.add(
            Room(
                id=room.get("id"),
                code=room.get("code"),
                name=room.get("name"),
                host_token=room.get("host_token"),
                owner_id=room.get("owner_id"),
                card_set=card_set,
                revealed=1 if room.get("revealed") else 0,
                active_issue_id=room.get("active_issue_id"),
                created_at=room.get("created_at"),
                updated_at=room.get("updated_at"),
            )
        )
    for participant in participants:
        db.add(
            Participant(
                id=participant.get("id"),
                room_id=participant.get("room_id"),
                name=participant.get("name"),
                token=participant.get("token"),
                is_spectator=1 if participant.get("is_spectator") else 0,
                last_seen_at=participant.get("last_seen_at"),
                created_at=participant.get("created_at"),
            )
        )
    for issue in issues:
        db.add(
            Issue(
                id=issue.get("id"),
                room_id=issue.get("room_id"),
                title=issue.get("title"),
                description=issue.get("description") or "",
                link=issue.get("link") or "",
                position=int(float(issue.get("position") or 0)),
                estimate=issue.get("estimate"),
                archived_at=issue.get("archived_at"),
                created_at=issue.get("created_at"),
            )
        )
    for vote in votes:
        db.add(
            Vote(
                id=vote.get("id"),
                room_id=vote.get("room_id"),
                issue_id=vote.get("issue_id"),
                participant_id=vote.get("participant_id"),
                value=vote.get("value"),
                created_at=vote.get("created_at"),
                updated_at=vote.get("updated_at"),
            )
        )
    db.commit()
    return {
        "rooms": len(rooms),
        "participants": len(participants),
        "issues": len(issues),
        "votes": len(votes),
    }
