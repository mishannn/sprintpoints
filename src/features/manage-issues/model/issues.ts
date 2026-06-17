import { supabase } from "../../../shared/api/supabase";
import type { Issue } from "../../../entities/room/model/types";
import { AppError } from "../../../shared/lib/AppError";

export type IssueDetailsInput = {
  title: string;
  description: string;
  link: string;
};

export type IssueImportInput = IssueDetailsInput & {
  estimate: string;
};

export async function createIssue(roomId: string, details: IssueDetailsInput, currentIssues: Issue[]) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
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
    throw new AppError("addStory", { cause: error });
  }

  const { error: roomError } = await supabase.from("rooms").update({ active_issue_id: issue.id, revealed: false }).eq("id", roomId);

  if (roomError) {
    throw new AppError("activateNewStory", { cause: roomError });
  }

  return issue;
}

export async function importIssues(roomId: string, details: IssueImportInput[], currentIssues: Issue[], activeIssueId: string | null) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const startPosition = Math.max(0, ...currentIssues.map((issue) => issue.position)) + 1;
  const rows = details
    .map((issue, index) => ({
      room_id: roomId,
      title: issue.title.trim(),
      description: issue.description.trim(),
      link: issue.link.trim(),
      estimate: issue.estimate.trim() || null,
      position: startPosition + index,
    }))
    .filter((issue) => issue.title);

  if (rows.length === 0) {
    return [];
  }

  const { data: issues, error } = await supabase.from("issues").insert(rows).select("*");

  if (error || !issues) {
    throw new AppError("importStories", { cause: error });
  }

  if (!activeIssueId && issues[0]) {
    const { error: roomError } = await supabase
      .from("rooms")
      .update({ active_issue_id: issues[0].id, revealed: false })
      .eq("id", roomId);

    if (roomError) {
      throw new AppError("activateImportedStory", { cause: roomError });
    }
  }

  return issues;
}

export async function updateIssueDetails(issueId: string, details: IssueDetailsInput) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const trimmedTitle = details.title.trim();
  if (!trimmedTitle) {
    throw new AppError("storyTitleRequired");
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
    throw new AppError("updateStory", { cause: error });
  }

  return issue;
}

export async function deleteIssue(roomId: string, issueId: string, nextActiveIssueId?: string | null) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const { error } = await supabase.from("issues").delete().eq("id", issueId).eq("room_id", roomId);

  if (error) {
    throw new AppError("deleteStory", { cause: error });
  }

  if (nextActiveIssueId === undefined) {
    return;
  }

  const { error: roomError } = await supabase.from("rooms").update({ active_issue_id: nextActiveIssueId, revealed: false }).eq("id", roomId);

  if (roomError) {
    throw new AppError("activateStoryAfterDelete", { cause: roomError });
  }
}

export async function activateIssue(roomId: string, issueId: string) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const { error } = await supabase.from("rooms").update({ active_issue_id: issueId, revealed: false }).eq("id", roomId);

  if (error) {
    throw new AppError("activateStory", { cause: error });
  }
}

export async function saveIssueEstimate(issueId: string, value: string) {
  if (!supabase) {
    throw new AppError("supabaseMissing");
  }

  const { error } = await supabase.from("issues").update({ estimate: value }).eq("id", issueId);

  if (error) {
    throw new AppError("saveEstimate", { cause: error });
  }
}
