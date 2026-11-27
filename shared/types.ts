// API contract shared by the React frontend and the Worker. Responses use
// snake_case because they are stored and rendered that way.

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

// ------------------------------------------------------ HTTP response bodies

export type CreateRoomResponse = {
  hostToken: string;
  participantToken: string;
  state: RoomState;
  participant: Participant;
};

export type JoinRoomResponse = {
  room: Room;
  participant: Participant;
  participantToken: string;
};

export type ApiErrorBody = {
  detail: string;
};

export type RoomUpdatedEvent = {
  type: "room_updated";
};

export type AdminImportResult = {
  rooms: number;
  participants: number;
  issues: number;
  votes: number;
};

// Raw rows returned by /api/admin/export and accepted by /api/admin/import.
// They mirror the SQLite columns, including the integer booleans.

export type RoomRecord = {
  id: string;
  code: string;
  name: string;
  host_token: string;
  owner_id: string | null;
  card_set: string;
  revealed: number | boolean;
  active_issue_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ParticipantRecord = {
  id: string;
  room_id: string;
  name: string;
  token: string;
  is_spectator: number | boolean;
  last_seen_at: string;
  created_at: string;
};

export type IssueRecord = {
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

export type VoteRecord = {
  id: string;
  room_id: string;
  issue_id: string;
  participant_id: string;
  value: string;
  created_at: string;
  updated_at: string;
};

export type AdminExport = {
  rooms: RoomRecord[];
  participants: ParticipantRecord[];
  issues: IssueRecord[];
  votes: VoteRecord[];
};
