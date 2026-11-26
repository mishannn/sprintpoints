import { apiRequest } from "../../../shared/api/client";
import type { CreateRoomBody, CreateRoomDefaults } from "../../../../shared/schemas";
import type { CreateRoomResponse } from "../../../../shared/types";

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

  return apiRequest<CreateRoomResponse>("/rooms", {
    body,
    errorCode: "createRoomApi",
  });
}
