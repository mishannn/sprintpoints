export type AppErrorCode =
  | "activateStory"
  | "addStory"
  | "archiveStory"
  | "archiveEstimatedStories"
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
  | "saveEstimate"
  | "saveVote"
  | "storyTitleRequired"
  | "transferOwnership"
  | "unarchiveStory"
  | "updateParticipantMode"
  | "updateStory";

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string = code) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}
