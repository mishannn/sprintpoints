const STORAGE_PREFIX = "planning-poker";

export const participantKey = (roomCode: string) => `${STORAGE_PREFIX}:participant:${roomCode}`;
export const hostKey = (roomCode: string) => `${STORAGE_PREFIX}:host:${roomCode}`;
