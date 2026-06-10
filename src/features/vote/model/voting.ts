import { supabase } from "../../../shared/api/supabase";

export async function submitVote(roomId: string, issueId: string, participantId: string, value: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
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
    throw new Error("Could not save your vote.");
  }
}

export async function revealRoomVotes(roomId: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.from("rooms").update({ revealed: true }).eq("id", roomId);

  if (error) {
    throw new Error("Could not reveal votes.");
  }
}

export async function resetIssueVoting(roomId: string, issueId: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const [{ error: voteError }, { error: roomError }] = await Promise.all([
    supabase.from("votes").delete().eq("issue_id", issueId),
    supabase.from("rooms").update({ revealed: false }).eq("id", roomId),
  ]);

  if (voteError || roomError) {
    throw new Error("Could not reset voting.");
  }
}
