import { apiRequest } from "../../../shared/api/client";

export async function submitVote(roomId: string, issueId: string, participantId: string, participantToken: string, value: string) {
  await apiRequest<void>(
    `/rooms/${encodeURIComponent(roomId)}/issues/${encodeURIComponent(issueId)}/votes/${encodeURIComponent(participantId)}`,
    {
      body: { value },
      errorCode: "saveVote",
      method: "PUT",
      participantToken,
    },
  );
}

export async function revealRoomVotes(roomId: string, hostToken: string) {
  await apiRequest<void>(`/rooms/${encodeURIComponent(roomId)}/reveal`, {
    errorCode: "revealVotes",
    hostToken,
    method: "PATCH",
  });
}

export async function resetIssueVoting(roomId: string, issueId: string, hostToken: string) {
  await apiRequest<void>(`/rooms/${encodeURIComponent(roomId)}/issues/${encodeURIComponent(issueId)}/reset-votes`, {
    errorCode: "resetVoting",
    hostToken,
    method: "POST",
  });
}

export async function deleteParticipantIssueVote(issueId: string, participantId: string, participantToken: string) {
  await apiRequest<void>(`/issues/${encodeURIComponent(issueId)}/votes/${encodeURIComponent(participantId)}`, {
    errorCode: "saveVote",
    method: "DELETE",
    participantToken,
  });
}
