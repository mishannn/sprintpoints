"""Story queue: create, import, edit, archive and estimate."""

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from clock import now
from db import Db
from errors import ApiError, not_found
from events import notify_room
from identity import new_id
from models import Issue, Vote
from schemas import ImportIssuesIn, IssueIn, NextActiveIssueIn, ValueIn
from security import HostToken, require_host
from views import issue_view

router = APIRouter()


def next_position(db: Session, room_id: str) -> int:
    current = db.scalar(select(func.max(Issue.position)).where(Issue.room_id == room_id))
    return (current or 0) + 1


@router.post("/rooms/{room}/issues", status_code=201)
async def create_issue(
    room: str,
    body: IssueIn,
    request: Request,
    db: Db,
    host_token: HostToken = None,
):
    found = require_host(db, room, host_token)
    title = body.title.strip()
    if not title:
        return JSONResponse(None, status_code=201)

    timestamp = now()
    issue = Issue(
        id=new_id(),
        room_id=found.id,
        title=title,
        description=(body.description or "").strip(),
        link=(body.link or "").strip(),
        position=next_position(db, found.id),
        estimate=None,
        archived_at=None,
        created_at=timestamp,
    )
    db.add(issue)
    found.active_issue_id = issue.id
    found.revealed = 0
    found.updated_at = timestamp
    db.commit()
    await notify_room(request, found.id)
    return issue_view(issue)


@router.post("/rooms/{room}/issues/import", status_code=201)
async def import_issues(
    room: str,
    body: ImportIssuesIn,
    request: Request,
    db: Db,
    host_token: HostToken = None,
):
    found = require_host(db, room, host_token)
    start = next_position(db, found.id)
    timestamp = now()
    imported = []
    for offset, item in enumerate(body.issues):
        title = item.title.strip()
        if not title:
            continue
        issue = Issue(
            id=new_id(),
            room_id=found.id,
            title=title,
            description=(item.description or "").strip(),
            link=(item.link or "").strip(),
            position=start + offset,
            estimate=(item.estimate or "").strip() or None,
            archived_at=None,
            created_at=timestamp,
        )
        db.add(issue)
        imported.append(issue)

    if imported and found.active_issue_id is None:
        found.active_issue_id = imported[0].id
        found.revealed = 0
        found.updated_at = timestamp
    db.commit()
    if imported:
        await notify_room(request, found.id)
    return [issue_view(issue) for issue in imported]


@router.patch("/issues/{issue}")
async def update_issue(
    issue: str,
    body: IssueIn,
    request: Request,
    db: Db,
    host_token: HostToken = None,
):
    found = db.get(Issue, issue)
    if found is None:
        raise not_found("storyNotFound")
    require_host(db, found.room_id, host_token)
    title = body.title.strip()
    if not title:
        raise ApiError(400, "storyTitleRequired")
    found.title = title
    found.description = (body.description or "").strip()
    found.link = (body.link or "").strip()
    db.commit()
    await notify_room(request, found.room_id)
    return issue_view(found)


@router.delete("/rooms/{room}/issues/{issue}", status_code=204)
async def delete_issue(
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
    db.delete(target)
    db.execute(delete(Vote).where(Vote.issue_id == target.id))
    provided = "next_active_issue_id" in request.query_params
    if found.active_issue_id == target.id or provided:
        found.active_issue_id = request.query_params.get("next_active_issue_id") or None
        found.revealed = 0
        found.updated_at = now()
    db.commit()
    await notify_room(request, found.id)
    return Response(status_code=204)


@router.patch("/rooms/{room}/issues/{issue}/archive")
async def archive_issue(
    room: str,
    issue: str,
    body: NextActiveIssueIn,
    request: Request,
    db: Db,
    host_token: HostToken = None,
):
    found = require_host(db, room, host_token)
    target = db.get(Issue, issue)
    if target is None or target.room_id != found.id:
        raise not_found("storyNotFound")
    timestamp = now()
    target.archived_at = timestamp
    if found.active_issue_id == target.id:
        found.active_issue_id = body.nextActiveIssueId
        found.revealed = 0
        found.updated_at = timestamp
    db.commit()
    await notify_room(request, found.id)
    return issue_view(target)


@router.post("/rooms/{room}/issues/archive-estimated")
async def archive_estimated(
    room: str,
    body: NextActiveIssueIn,
    request: Request,
    db: Db,
    host_token: HostToken = None,
):
    found = require_host(db, room, host_token)
    rows = db.scalars(
        select(Issue)
        .where(
            Issue.room_id == found.id,
            Issue.archived_at.is_(None),
            Issue.estimate.is_not(None),
            Issue.estimate != "",
        )
        .order_by(Issue.position, Issue.id)
    ).all()
    timestamp = now()
    for issue in rows:
        issue.archived_at = timestamp
        if found.active_issue_id == issue.id:
            found.active_issue_id = body.nextActiveIssueId
            found.revealed = 0
            found.updated_at = timestamp
    db.commit()
    if rows:
        await notify_room(request, found.id)
    return [issue_view(issue) for issue in rows]


@router.patch("/rooms/{room}/issues/{issue}/unarchive")
async def unarchive_issue(
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
    target.archived_at = None
    db.commit()
    await notify_room(request, found.id)
    return issue_view(target)


@router.patch("/issues/{issue}/estimate", status_code=204)
async def set_estimate(
    issue: str,
    body: ValueIn,
    request: Request,
    db: Db,
    host_token: HostToken = None,
):
    target = db.get(Issue, issue)
    if target is None:
        raise not_found("storyNotFound")
    require_host(db, target.room_id, host_token)
    target.estimate = body.value
    db.commit()
    await notify_room(request, target.room_id)
    return Response(status_code=204)
