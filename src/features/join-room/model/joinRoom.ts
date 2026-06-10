import { supabase } from "../../../shared/api/supabase";
import { normalizeCode } from "../../../shared/lib/roomCode";
import { makeToken } from "../../../shared/lib/token";

export async function joinPlanningRoom(code: string, name: string, isSpectator: boolean) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const normalizedCode = normalizeCode(code);

  if (!normalizedCode || !name.trim()) {
    throw new Error("Enter a room code and your name.");
  }

  const { data: room, error: roomError } = await supabase.from("rooms").select("*").eq("code", normalizedCode).single();

  if (roomError || !room) {
    throw new Error("Room not found.");
  }

  const token = makeToken();
  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .insert({ room_id: room.id, name: name.trim(), token, is_spectator: isSpectator })
    .select("*")
    .single();

  if (participantError || !participant) {
    throw new Error("Could not join the room.");
  }

  return {
    room,
    participant,
    participantToken: token,
  };
}
