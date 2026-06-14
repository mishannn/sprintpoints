import { supabase } from "../../../shared/api/supabase";
import { AppError } from "../../../shared/lib/AppError";
import { normalizeCode } from "../../../shared/lib/roomCode";
import { makeToken } from "../../../shared/lib/token";

export async function joinPlanningRoom(code: string, name: string, isSpectator: boolean) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const normalizedCode = normalizeCode(code);

  if (!normalizedCode || !name.trim()) {
    throw new AppError("joinRoomRequired");
  }

  const { data: room, error: roomError } = await supabase.from("rooms").select("*").eq("code", normalizedCode).single();

  if (roomError || !room) {
    throw new AppError("roomNotFound", { cause: roomError });
  }

  const token = makeToken();
  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .insert({ room_id: room.id, name: name.trim(), token, is_spectator: isSpectator })
    .select("*")
    .single();

  if (participantError || !participant) {
    throw new AppError("joinRoom", { cause: participantError });
  }

  return {
    room,
    participant,
    participantToken: token,
  };
}
