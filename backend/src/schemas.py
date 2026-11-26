"""Pydantic request bodies (camelCase, unknown keys ignored)."""

from pydantic import BaseModel, StrictBool


class Defaults(BaseModel):
    roomName: str
    facilitatorName: str
    firstStoryTitle: str


class CreateRoomIn(BaseModel):
    roomName: str
    participantName: str
    defaults: Defaults


class JoinIn(BaseModel):
    name: str
    isSpectator: StrictBool


class TransferIn(BaseModel):
    participantId: str


class ParticipantIn(BaseModel):
    isSpectator: StrictBool


class IssueIn(BaseModel):
    title: str
    description: str | None = None
    link: str | None = None


class ImportIssue(IssueIn):
    estimate: str | None = None


class ImportIssuesIn(BaseModel):
    issues: list[ImportIssue]


class ValueIn(BaseModel):
    value: str


class ActiveIssueIn(BaseModel):
    issueId: str | None


class NextActiveIssueIn(BaseModel):
    nextActiveIssueId: str | None
