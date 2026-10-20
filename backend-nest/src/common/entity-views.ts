import { tokensEqual } from "./identity";
import { Issue, Participant, Room, Vote } from "../database/entities";
import { IssueView, ParticipantView, RoomView, VoteView } from "./views";

export function formatTimestamp(value: Date | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const iso = value.toISOString();
  return iso.endsWith(".000Z") ? `${iso.slice(0, -5)}Z` : iso;
}

export function roomView(room: Room, revealHostToken: boolean): RoomView {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    host_token: revealHostToken ? room.hostToken : "",
    owner_id: room.ownerId,
    card_set: room.cardSet,
    revealed: room.revealed,
    active_issue_id: room.activeIssueId,
    created_at: formatTimestamp(room.createdAt) as string,
    updated_at: formatTimestamp(room.updatedAt) as string,
  };
}

export function participantView(participant: Participant, requestToken: string | null | undefined): ParticipantView {
  return {
    id: participant.id,
    room_id: participant.roomId,
    name: participant.name,
    token: tokensEqual(requestToken, participant.token) ? participant.token : "",
    is_spectator: participant.isSpectator,
    last_seen_at: formatTimestamp(participant.lastSeenAt) as string,
    created_at: formatTimestamp(participant.createdAt) as string,
  };
}

export function issueView(issue: Issue): IssueView {
  return {
    id: issue.id,
    room_id: issue.roomId,
    title: issue.title,
    description: issue.description,
    link: issue.link,
    position: issue.position,
    estimate: issue.estimate,
    archived_at: formatTimestamp(issue.archivedAt),
    created_at: formatTimestamp(issue.createdAt) as string,
  };
}

export function voteView(vote: Vote): VoteView {
  return {
    id: vote.id,
    room_id: vote.roomId,
    issue_id: vote.issueId,
    participant_id: vote.participantId,
    value: vote.value,
    created_at: formatTimestamp(vote.createdAt) as string,
    updated_at: formatTimestamp(vote.updatedAt) as string,
  };
}
