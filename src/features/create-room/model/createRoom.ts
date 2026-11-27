import type { CreateRoomBody, CreateRoomDefaults } from "../../../../shared/schemas";
import type { CreateRoomResponse } from "../../../../shared/types";
import { apiCall } from "../../../shared/api/client";
import { createRoom } from "../../../shared/api/generated";

export async function createPlanningRoom(
  roomName: string,
  participantName: string,
  defaults: CreateRoomDefaults,
) {
  const body: CreateRoomBody = {
    roomName: roomName.trim() || defaults.roomName,
    participantName: participantName.trim() || defaults.facilitatorName,
    defaults,
  };

  return apiCall(
    "createRoomApi",
    createRoom({ body, throwOnError: true }),
  ) satisfies Promise<CreateRoomResponse>;
}
