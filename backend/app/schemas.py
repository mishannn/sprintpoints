from __future__ import annotations

from pydantic import BaseModel, Field


class CreateRoomDefaults(BaseModel):
    facilitator_name: str = Field(alias="facilitatorName")
    first_story_title: str = Field(alias="firstStoryTitle")
    room_name: str = Field(alias="roomName")


class CreateRoomRequest(BaseModel):
    room_name: str = Field(alias="roomName")
    participant_name: str = Field(alias="participantName")
    defaults: CreateRoomDefaults


class JoinRoomRequest(BaseModel):
    name: str
    is_spectator: bool = Field(alias="isSpectator")


class IssueDetailsRequest(BaseModel):
    title: str
    description: str = ""
    link: str = ""


class IssueImportRequest(IssueDetailsRequest):
    estimate: str = ""


class ImportIssuesRequest(BaseModel):
    issues: list[IssueImportRequest]


class NextActiveIssueRequest(BaseModel):
    next_active_issue_id: str | None = Field(default=None, alias="nextActiveIssueId")


class ActiveIssueRequest(BaseModel):
    issue_id: str | None = Field(alias="issueId")


class EstimateRequest(BaseModel):
    value: str


class VoteRequest(BaseModel):
    value: str


class ParticipantModeRequest(BaseModel):
    is_spectator: bool = Field(alias="isSpectator")
