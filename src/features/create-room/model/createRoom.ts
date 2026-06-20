import { apiRequest } from "../../../shared/api/client";
import type { Participant, RoomState } from "../../../entities/room/model/types";

type CreateRoomDefaults = {
  facilitatorName: string;
  firstStoryTitle: string;
  roomName: string;
};

export async function createPlanningRoom(roomName: string, participantName: string, defaults: CreateRoomDefaults) {
  const result = await apiRequest<{
    hostToken: string;
    participantToken: string;
    state: RoomState;
    participant: Participant;
  }>("/rooms", {
    body: {
      roomName: roomName.trim() || defaults.roomName,
      participantName: participantName.trim() || defaults.facilitatorName,
      defaults,
    },
    errorCode: "createRoomApi",
  });

  return result;
}
