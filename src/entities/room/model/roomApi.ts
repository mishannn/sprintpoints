import { supabase } from "../../../shared/api/supabase";
import { AppError } from "../../../shared/lib/AppError";
import { normalizeCode } from "../../../shared/lib/roomCode";
import type { RoomState } from "./types";

export async function loadRoomState(code: string): Promise<RoomState> {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const { data: room, error: roomError } = await supabase.from("rooms").select("*").eq("code", normalizeCode(code)).single();

  if (roomError || !room) {
    throw new AppError("roomNotFound", { cause: roomError });
  }

  const [{ data: participants, error: participantsError }, { data: issues, error: issuesError }, { data: votes, error: votesError }] =
    await Promise.all([
      supabase.from("participants").select("*").eq("room_id", room.id).order("created_at"),
      supabase.from("issues").select("*").eq("room_id", room.id).order("position"),
      supabase.from("votes").select("*").eq("room_id", room.id),
    ]);

  if (participantsError || issuesError || votesError) {
    throw new AppError("loadRoomState", { cause: participantsError ?? issuesError ?? votesError });
  }

  return {
    room,
    participants: participants ?? [],
    issues: issues ?? [],
    votes: votes ?? [],
  };
}
