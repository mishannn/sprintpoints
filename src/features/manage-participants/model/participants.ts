import { apiRequest } from "../../../shared/api/client";

export async function deleteParticipant(roomId: string, participantId: string, hostToken: string) {
  await apiRequest<void>(`/rooms/${encodeURIComponent(roomId)}/participants/${encodeURIComponent(participantId)}`, {
    errorCode: "deleteParticipant",
    hostToken,
    method: "DELETE",
  });
}

export async function updateParticipantSpectatorMode(participantId: string, token: string, isSpectator: boolean) {
  await apiRequest<void>(`/participants/${encodeURIComponent(participantId)}`, {
    body: { isSpectator },
    errorCode: "updateParticipantMode",
    method: "PATCH",
    participantToken: token,
  });
}

export async function sendParticipantHeartbeat(participantId: string, token: string) {
  await apiRequest<void>(`/participants/${encodeURIComponent(participantId)}/heartbeat`, {
    errorCode: "updateParticipantMode",
    method: "POST",
    participantToken: token,
  });
}
