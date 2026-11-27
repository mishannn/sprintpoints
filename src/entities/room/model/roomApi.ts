import { apiAuth, apiCall } from "../../../shared/api/client";
import { getRoom } from "../../../shared/api/generated";
import { normalizeCode } from "../../../shared/lib/roomCode";
import type { RoomState } from "./types";

type RoomAuth = {
  hostToken?: string | null;
  participantToken?: string | null;
};

export async function loadRoomState(code: string, auth: RoomAuth): Promise<RoomState> {
  return apiCall(
    "loadRoomState",
    getRoom({
      path: { room: normalizeCode(code) },
      auth: apiAuth(auth),
      throwOnError: true,
    }),
  );
}
