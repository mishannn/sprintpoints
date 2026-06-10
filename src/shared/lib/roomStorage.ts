const STORAGE_PREFIX = "planning-poker";

export const participantKey = (roomId: string) => `${STORAGE_PREFIX}:participant:${roomId}`;
export const hostKey = (roomId: string) => `${STORAGE_PREFIX}:host:${roomId}`;
