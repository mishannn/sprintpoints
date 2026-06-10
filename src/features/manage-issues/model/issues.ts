import { supabase } from "../../../shared/api/supabase";
import type { Issue } from "../../../entities/room/model/types";

export async function createIssue(roomId: string, title: string, currentIssues: Issue[]) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return null;
  }

  const nextPosition = Math.max(0, ...currentIssues.map((issue) => issue.position)) + 1;
  const { data: issue, error } = await supabase
    .from("issues")
    .insert({ room_id: roomId, title: trimmedTitle, position: nextPosition })
    .select("*")
    .single();

  if (error || !issue) {
    throw new Error("Could not add the story.");
  }

  const { error: roomError } = await supabase.from("rooms").update({ active_issue_id: issue.id, revealed: false }).eq("id", roomId);

  if (roomError) {
    throw new Error("Could not activate the new story.");
  }

  return issue;
}

export async function activateIssue(roomId: string, issueId: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.from("rooms").update({ active_issue_id: issueId, revealed: false }).eq("id", roomId);

  if (error) {
    throw new Error("Could not switch story.");
  }
}

export async function saveIssueEstimate(issueId: string, value: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.from("issues").update({ estimate: value }).eq("id", issueId);

  if (error) {
    throw new Error("Could not save the estimate.");
  }
}
