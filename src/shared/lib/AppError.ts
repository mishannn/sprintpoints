export type AppErrorCode =
  | "activateImportedStory"
  | "activateNewStory"
  | "activateStory"
  | "activateStoryAfterArchive"
  | "activateStoryAfterDelete"
  | "addFacilitator"
  | "addStory"
  | "archiveStory"
  | "archiveEstimatedStories"
  | "createFirstStory"
  | "createRoomApi"
  | "csvHeaderEmpty"
  | "deleteParticipant"
  | "deleteStory"
  | "importStories"
  | "joinRoom"
  | "joinRoomRequired"
  | "loadRoomState"
  | "resetVoting"
  | "revealVotes"
  | "roomNotFound"
  | "saveEstimate"
  | "saveVote"
  | "storyTitleRequired"
  | "supabaseMissing"
  | "unarchiveStory"
  | "updateParticipantMode"
  | "updateStory";

type AppErrorOptions = {
  cause?: unknown;
  message?: string;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly cause?: unknown;

  constructor(code: AppErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? code);
    this.name = "AppError";
    this.code = code;
    this.cause = options.cause;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
