from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Issue
from ..schemas import (
    ActiveIssueRequest,
    EstimateRequest,
    ImportIssuesRequest,
    IssueDetailsRequest,
    NextActiveIssueRequest,
)
from ..services import (
    assert_host,
    get_issue,
    get_room,
    new_id,
    next_position,
    now,
    serialize_issue,
)


router = APIRouter(prefix="/api")


@router.post("/rooms/{room_id}/issues", status_code=status.HTTP_201_CREATED)
def create_issue(
    room_id: str,
    payload: IssueDetailsRequest,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> dict[str, Any] | None:
    assert_host(db, room_id, x_host_token)
    title = payload.title.strip()
    if not title:
        return None
    timestamp = now()
    issue = Issue(
        id=new_id(),
        room_id=room_id,
        title=title,
        description=payload.description.strip(),
        link=payload.link.strip(),
        position=next_position(db, room_id),
        estimate=None,
        archived_at=None,
        created_at=timestamp,
    )
    db.add(issue)
    room = get_room(db, room_id)
    room.active_issue_id = issue.id
    room.revealed = False
    room.updated_at = timestamp
    db.flush()
    return serialize_issue(get_issue(db, issue.id))


@router.post("/rooms/{room_id}/issues/import", status_code=status.HTTP_201_CREATED)
def import_issues(
    room_id: str,
    payload: ImportIssuesRequest,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> list[dict[str, Any]]:
    room = get_room(db, room_id)
    assert_host(db, room_id, x_host_token)
    position = next_position(db, room_id)
    timestamp = now()
    created_issues: list[Issue] = []

    for offset, item in enumerate(payload.issues):
        title = item.title.strip()
        if not title:
            continue
        issue = Issue(
            id=new_id(),
            room_id=room_id,
            title=title,
            description=item.description.strip(),
            link=item.link.strip(),
            position=position + offset,
            estimate=item.estimate.strip() or None,
            archived_at=None,
            created_at=timestamp,
        )
        created_issues.append(issue)
        db.add(issue)

    if created_issues and room.active_issue_id is None:
        room.active_issue_id = created_issues[0].id
        room.revealed = False
        room.updated_at = timestamp

    db.flush()
    return [serialize_issue(issue) for issue in sorted(created_issues, key=lambda item: item.position)]


@router.patch("/issues/{issue_id}")
def update_issue(
    issue_id: str,
    payload: IssueDetailsRequest,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> dict[str, Any]:
    issue = get_issue(db, issue_id)
    assert_host(db, issue.room_id, x_host_token)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "storyTitleRequired")
    issue.title = title
    issue.description = payload.description.strip()
    issue.link = payload.link.strip()
    db.flush()
    return serialize_issue(issue)


@router.delete("/rooms/{room_id}/issues/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(
    room_id: str,
    issue_id: str,
    next_active_issue_id: str | None = None,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> Response:
    assert_host(db, room_id, x_host_token)
    issue = get_issue(db, issue_id)
    if issue.room_id != room_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "storyNotFound")
    room = get_room(db, room_id)
    db.delete(issue)
    if room.active_issue_id == issue_id or next_active_issue_id is not None:
        room.active_issue_id = next_active_issue_id or None
        room.revealed = False
        room.updated_at = now()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/rooms/{room_id}/issues/{issue_id}/archive")
def archive_issue(
    room_id: str,
    issue_id: str,
    payload: NextActiveIssueRequest,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> dict[str, Any]:
    assert_host(db, room_id, x_host_token)
    issue = get_issue(db, issue_id)
    if issue.room_id != room_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "storyNotFound")
    room = get_room(db, room_id)
    timestamp = now()
    issue.archived_at = timestamp
    if room.active_issue_id == issue_id:
        room.active_issue_id = payload.next_active_issue_id
        room.revealed = False
        room.updated_at = timestamp
    db.flush()
    return serialize_issue(issue)


@router.post("/rooms/{room_id}/issues/archive-estimated")
def archive_estimated_issues(
    room_id: str,
    payload: NextActiveIssueRequest,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> list[dict[str, Any]]:
    assert_host(db, room_id, x_host_token)
    room = get_room(db, room_id)
    timestamp = now()
    issues = db.scalars(
        select(Issue).where(
            Issue.room_id == room_id,
            Issue.archived_at.is_(None),
            Issue.estimate.is_not(None),
            Issue.estimate != "",
        )
    ).all()

    active_issue_will_be_archived = bool(room.active_issue_id and any(issue.id == room.active_issue_id for issue in issues))
    for issue in issues:
        issue.archived_at = timestamp

    if active_issue_will_be_archived:
        room.active_issue_id = payload.next_active_issue_id
        room.revealed = False
        room.updated_at = timestamp

    db.flush()
    return [serialize_issue(issue) for issue in sorted(issues, key=lambda item: item.position)]


@router.patch("/rooms/{room_id}/issues/{issue_id}/unarchive")
def unarchive_issue(
    room_id: str,
    issue_id: str,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> dict[str, Any]:
    assert_host(db, room_id, x_host_token)
    issue = get_issue(db, issue_id)
    if issue.room_id != room_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "storyNotFound")
    issue.archived_at = None
    db.flush()
    return serialize_issue(issue)


@router.patch("/rooms/{room_id}/active-issue", status_code=status.HTTP_204_NO_CONTENT)
def activate_issue(
    room_id: str,
    payload: ActiveIssueRequest,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> Response:
    assert_host(db, room_id, x_host_token)
    if payload.issue_id is not None:
        issue = get_issue(db, payload.issue_id)
        if issue.room_id != room_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "storyNotFound")
    room = get_room(db, room_id)
    room.active_issue_id = payload.issue_id
    room.revealed = False
    room.updated_at = now()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/issues/{issue_id}/estimate", status_code=status.HTTP_204_NO_CONTENT)
def save_estimate(
    issue_id: str,
    payload: EstimateRequest,
    db: Session = Depends(get_db),
    x_host_token: str | None = Header(default=None),
) -> Response:
    issue = get_issue(db, issue_id)
    assert_host(db, issue.room_id, x_host_token)
    issue.estimate = payload.value
    return Response(status_code=status.HTTP_204_NO_CONTENT)
