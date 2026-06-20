import { apiRequest } from "../../../shared/api/client";
import { normalizeCode } from "../../../shared/lib/roomCode";
import type { RoomState } from "./types";

type RoomAuth = {
  hostToken?: string | null;
  participantToken?: string | null;
};

export async function loadRoomState(code: string, auth: RoomAuth): Promise<RoomState> {
  return apiRequest<RoomState>(`/rooms/${encodeURIComponent(normalizeCode(code))}`, {
    errorCode: "loadRoomState",
    hostToken: auth.hostToken,
    participantToken: auth.participantToken,
  });
}
