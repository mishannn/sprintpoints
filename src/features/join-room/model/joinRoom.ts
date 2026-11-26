import { apiRequest } from "../../../shared/api/client";
import type { JoinRoomBody } from "../../../../shared/schemas";
import type { JoinRoomResponse } from "../../../../shared/types";
import { AppError } from "../../../shared/lib/AppError";
import { normalizeCode } from "../../../shared/lib/roomCode";

export async function joinPlanningRoom(code: string, name: string, isSpectator: boolean) {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode || !name.trim()) {
    throw new AppError("joinRoomRequired");
  }

  return apiRequest<JoinRoomResponse>(`/rooms/${encodeURIComponent(normalizedCode)}/join`, {
    body: { name: name.trim(), isSpectator } satisfies JoinRoomBody,
    errorCode: "joinRoom",
  });
}
