import { supabase } from "../../../shared/api/supabase";
import type { Issue } from "../../../entities/room/model/types";

export type IssueDetailsInput = {
  title: string;
  description: string;
  link: string;
};

export async function createIssue(roomId: string, details: IssueDetailsInput, currentIssues: Issue[]) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const trimmedTitle = details.title.trim();
  if (!trimmedTitle) {
    return null;
  }

  const description = details.description.trim();
  const link = details.link.trim();
  const nextPosition = Math.max(0, ...currentIssues.map((issue) => issue.position)) + 1;
  const { data: issue, error } = await supabase
    .from("issues")
    .insert({ room_id: roomId, title: trimmedTitle, description, link, position: nextPosition })
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

export async function updateIssueDetails(issueId: string, details: IssueDetailsInput) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const trimmedTitle = details.title.trim();
  if (!trimmedTitle) {
    throw new Error("Story title is required.");
  }

  const { data: issue, error } = await supabase
    .from("issues")
    .update({
      title: trimmedTitle,
      description: details.description.trim(),
      link: details.link.trim(),
    })
    .eq("id", issueId)
    .select("*")
    .single();

  if (error || !issue) {
    throw new Error("Could not update the story.");
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
