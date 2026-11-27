import { apiAuth, apiCall } from "../../../shared/api/client";
import {
  heartbeat,
  removeParticipant,
  transferOwnership,
  updateParticipant,
} from "../../../shared/api/generated";

export async function deleteParticipant(roomId: string, participantId: string, hostToken: string) {
  await apiCall(
    "deleteParticipant",
    removeParticipant({
      path: { room: roomId, participant: participantId },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  );
}

export async function transferRoomOwnership(
  roomId: string,
  participantId: string,
  hostToken: string,
) {
  await apiCall(
    "transferOwnership",
    transferOwnership({
      path: { room: roomId },
      body: { participantId },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  );
}

export async function updateParticipantSpectatorMode(
  participantId: string,
  token: string,
  isSpectator: boolean,
) {
  await apiCall(
    "updateParticipantMode",
    updateParticipant({
      path: { participant: participantId },
      body: { isSpectator },
      auth: apiAuth({ participantToken: token }),
      throwOnError: true,
    }),
  );
}

export async function sendParticipantHeartbeat(participantId: string, token: string) {
  await apiCall(
    "updateParticipantMode",
    heartbeat({
      path: { participant: participantId },
      auth: apiAuth({ participantToken: token }),
      throwOnError: true,
    }),
  );
}
