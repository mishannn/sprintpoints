import { apiRequest } from "../../../shared/api/client";
import type { Participant, Room } from "../../../entities/room/model/types";
import { AppError } from "../../../shared/lib/AppError";
import { normalizeCode } from "../../../shared/lib/roomCode";

export async function joinPlanningRoom(code: string, name: string, isSpectator: boolean) {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode || !name.trim()) {
    throw new AppError("joinRoomRequired");
  }

  return apiRequest<{
    room: Room;
    participant: Participant;
    participantToken: string;
  }>(`/rooms/${encodeURIComponent(normalizedCode)}/join`, {
    body: { name: name.trim(), isSpectator },
    errorCode: "joinRoom",
  });
}
