import type { JoinRoomBody } from "../../../../shared/schemas";
import type { JoinRoomResponse } from "../../../../shared/types";
import { apiCall } from "../../../shared/api/client";
import { joinRoom } from "../../../shared/api/generated";
import { AppError } from "../../../shared/lib/AppError";
import { normalizeCode } from "../../../shared/lib/roomCode";

export async function joinPlanningRoom(code: string, name: string, isSpectator: boolean) {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode || !name.trim()) {
    throw new AppError("joinRoomRequired");
  }

  return apiCall(
    "joinRoom",
    joinRoom({
      path: { room: normalizedCode },
      body: { name: name.trim(), isSpectator } satisfies JoinRoomBody,
      throwOnError: true,
    }),
  ) satisfies Promise<JoinRoomResponse>;
}
