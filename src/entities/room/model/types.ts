// Keep the API response field names as returned by the server.
export type Room = {
  id: string;
  code: string;
  name: string;
  host_token: string;
  owner_id: string | null;
  card_set: string[];
  revealed: boolean;
  active_issue_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Participant = {
  id: string;
  room_id: string;
  name: string;
  token: string;
  is_spectator: boolean;
  last_seen_at: string;
  created_at: string;
};

export type Issue = {
  id: string;
  room_id: string;
  title: string;
  description: string;
  link: string;
  position: number;
  estimate: string | null;
  archived_at: string | null;
  created_at: string;
};

export type Vote = {
  id: string;
  room_id: string;
  issue_id: string;
  participant_id: string;
  value: string;
  created_at: string;
  updated_at: string;
};

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
