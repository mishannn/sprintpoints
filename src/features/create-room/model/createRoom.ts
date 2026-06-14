import { DEFAULT_CARDS } from "../../../shared/config/cards";
import { supabase } from "../../../shared/api/supabase";
import { AppError } from "../../../shared/lib/AppError";
import { makeToken } from "../../../shared/lib/token";

type CreateRoomDefaults = {
  facilitatorName: string;
  firstStoryTitle: string;
  roomName: string;
};

export async function createPlanningRoom(roomName: string, participantName: string, defaults: CreateRoomDefaults) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const hostToken = makeToken();
  const participantToken = makeToken();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .insert({ name: roomName.trim() || defaults.roomName, host_token: hostToken, card_set: DEFAULT_CARDS })
    .select("*")
    .single();

  if (roomError || !room) {
    throw new AppError("createRoomApi", { cause: roomError });
  }

  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .insert({ room_id: room.id, name: participantName.trim() || defaults.facilitatorName, token: participantToken })
    .select("*")
    .single();

  if (participantError || !participant) {
    throw new AppError("addFacilitator", { cause: participantError });
  }

  const { data: issue, error: issueError } = await supabase
    .from("issues")
    .insert({ room_id: room.id, title: defaults.firstStoryTitle, description: "", link: "", position: 1 })
    .select("*")
    .single();

  if (issueError || !issue) {
    throw new AppError("createFirstStory", { cause: issueError });
  }

  const { data: updatedRoom, error: updateError } = await supabase
    .from("rooms")
    .update({ active_issue_id: issue.id })
    .eq("id", room.id)
    .select("*")
    .single();

  if (updateError || !updatedRoom) {
    throw new AppError("activateNewStory", { cause: updateError });
  }

  return {
    hostToken,
    participantToken,
    state: {
      room: updatedRoom,
      participants: [participant],
      issues: [issue],
      votes: [],
    },
    participant,
  };
}
