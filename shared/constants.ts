// Runtime values shared by the browser.

export const DEFAULT_CARD_SET: readonly string[] = [
  "0",
  "1",
  "2",
  "3",
  "5",
  "8",
  "13",
  "21",
  "?",
  "Coffee",
];

export const ROOM_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const ROOM_CODE_LENGTH = 6;
export const MAX_ROOM_CODE_ATTEMPTS = 20;

export const HOST_TOKEN_HEADER = "X-Host-Token";
export const PARTICIPANT_TOKEN_HEADER = "X-Participant-Token";
export const ADMIN_TOKEN_HEADER = "X-Admin-Token";

export const ROOM_UPDATED_EVENT = "room_updated";
export const ROOM_UPDATED_MESSAGE = JSON.stringify({ type: ROOM_UPDATED_EVENT });

export function normalizeRoomCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function roomWebSocketPath(roomId: string): string {
  return `/rooms/${encodeURIComponent(roomId)}/ws`;
}
