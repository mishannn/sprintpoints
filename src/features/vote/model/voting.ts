import { supabase } from "../../../shared/api/supabase";
import { AppError } from "../../../shared/lib/AppError";

export async function submitVote(roomId: string, issueId: string, participantId: string, value: string) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const { error } = await supabase.from("votes").upsert(
    {
      room_id: roomId,
      issue_id: issueId,
      participant_id: participantId,
      value,
    },
    { onConflict: "issue_id,participant_id" },
  );

  if (error) {
    throw new AppError("saveVote", { cause: error });
  }
}

export async function revealRoomVotes(roomId: string) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const { error } = await supabase.from("rooms").update({ revealed: true }).eq("id", roomId);

  if (error) {
    throw new AppError("revealVotes", { cause: error });
  }
}

export async function resetIssueVoting(roomId: string, issueId: string) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const [{ error: voteError }, { error: roomError }] = await Promise.all([
    supabase.from("votes").delete().eq("issue_id", issueId),
    supabase.from("rooms").update({ revealed: false }).eq("id", roomId),
  ]);

  if (voteError || roomError) {
    throw new AppError("resetVoting", { cause: voteError ?? roomError });
  }
}
