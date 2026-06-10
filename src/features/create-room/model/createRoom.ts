import { DEFAULT_CARDS } from "../../../shared/config/cards";
import { supabase } from "../../../shared/api/supabase";
import { makeToken } from "../../../shared/lib/token";

export async function createPlanningRoom(roomName: string, participantName: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const hostToken = makeToken();
  const participantToken = makeToken();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .insert({ name: roomName.trim() || "Sprint planning", host_token: hostToken, card_set: DEFAULT_CARDS })
    .select("*")
    .single();

  if (roomError || !room) {
    throw new Error("Could not create a room.");
  }

  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .insert({ room_id: room.id, name: participantName.trim() || "Facilitator", token: participantToken })
    .select("*")
    .single();

  if (participantError || !participant) {
    throw new Error("Could not add the facilitator.");
  }

  const { data: issue, error: issueError } = await supabase
    .from("issues")
    .insert({ room_id: room.id, title: "First story", description: "", link: "", position: 1 })
    .select("*")
    .single();

  if (issueError || !issue) {
    throw new Error("Could not create the first story.");
  }

  const { data: updatedRoom, error: updateError } = await supabase
    .from("rooms")
    .update({ active_issue_id: issue.id })
    .eq("id", room.id)
    .select("*")
    .single();

  if (updateError || !updatedRoom) {
    throw new Error("Could not activate the first story.");
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
