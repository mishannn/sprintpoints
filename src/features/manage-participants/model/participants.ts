import { supabase } from "../../../shared/api/supabase";
import { AppError } from "../../../shared/lib/AppError";

export async function deleteParticipant(roomId: string, participantId: string, hostToken: string) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const { error } = await supabase.rpc("delete_participant_as_host", {
    p_room_id: roomId,
    p_participant_id: participantId,
    p_host_token: hostToken,
  });

  if (error) {
    throw new AppError("deleteParticipant", { cause: error });
  }
}

export async function updateParticipantSpectatorMode(participantId: string, token: string, isSpectator: boolean) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const { error } = await supabase
    .from("participants")
    .update({ is_spectator: isSpectator })
    .eq("id", participantId)
    .eq("token", token);

  if (error) {
    throw new AppError("updateParticipantMode", { cause: error });
  }
}
