import { apiAuth, apiCall } from "../../../shared/api/client";
import { castVote, deleteVote, resetVotes, revealVotes } from "../../../shared/api/generated";

export async function submitVote(
  roomId: string,
  issueId: string,
  participantId: string,
  participantToken: string,
  value: string,
) {
  await apiCall(
    "saveVote",
    castVote({
      path: { room: roomId, issue: issueId, participant: participantId },
      body: { value },
      auth: apiAuth({ participantToken }),
      throwOnError: true,
    }),
  );
}

export async function revealRoomVotes(roomId: string, hostToken: string) {
  await apiCall(
    "revealVotes",
    revealVotes({
      path: { room: roomId },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  );
}

export async function resetIssueVoting(roomId: string, issueId: string, hostToken: string) {
  await apiCall(
    "resetVoting",
    resetVotes({
      path: { room: roomId, issue: issueId },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  );
}

export async function deleteParticipantIssueVote(
  issueId: string,
  participantId: string,
  participantToken: string,
) {
  await apiCall(
    "saveVote",
    deleteVote({
      path: { issue: issueId, participant: participantId },
      auth: apiAuth({ participantToken }),
      throwOnError: true,
    }),
  );
}
