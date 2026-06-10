import type { Issue, Participant, Room, Vote } from "../../../types";

export type { Issue, Participant, Room, Vote };

export type RoomState = {
  room: Room;
  participants: Participant[];
  issues: Issue[];
  votes: Vote[];
};

export type Notice = {
  kind: "error" | "success" | "info";
  message: string;
};
