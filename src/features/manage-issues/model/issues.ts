import { apiRequest } from "../../../shared/api/client";
import type { Issue } from "../../../entities/room/model/types";
import { AppError } from "../../../shared/lib/AppError";
import { normalizeEstimate } from "./estimate";

export type IssueDetailsInput = {
  title: string;
  description: string;
  link: string;
};

export type IssueImportInput = IssueDetailsInput & {
  estimate: string;
};

export async function createIssue(roomId: string, details: IssueDetailsInput, hostToken: string) {
  const trimmedTitle = details.title.trim();
  if (!trimmedTitle) {
    return null;
  }

  return apiRequest<Issue | null>(`/rooms/${encodeURIComponent(roomId)}/issues`, {
    body: {
      title: trimmedTitle,
      description: details.description.trim(),
      link: details.link.trim(),
    },
    errorCode: "addStory",
    hostToken,
  });
}

export async function importIssues(roomId: string, details: IssueImportInput[], hostToken: string) {
  const issues = details
    .map((issue) => ({
      title: issue.title.trim(),
      description: issue.description.trim(),
      link: issue.link.trim(),
      estimate: normalizeEstimate(issue.estimate) || "",
    }))
    .filter((issue) => issue.title);

  if (issues.length === 0) {
    return [];
  }

  return apiRequest<Issue[]>(`/rooms/${encodeURIComponent(roomId)}/issues/import`, {
    body: { issues },
    errorCode: "importStories",
    hostToken,
  });
}

export async function updateIssueDetails(issueId: string, details: IssueDetailsInput, hostToken: string) {
  const trimmedTitle = details.title.trim();
  if (!trimmedTitle) {
    throw new AppError("storyTitleRequired");
  }

  return apiRequest<Issue>(`/issues/${encodeURIComponent(issueId)}`, {
    body: {
      title: trimmedTitle,
      description: details.description.trim(),
      link: details.link.trim(),
    },
    errorCode: "updateStory",
    hostToken,
    method: "PATCH",
  });
}

export async function deleteIssue(roomId: string, issueId: string, hostToken: string, nextActiveIssueId?: string | null) {
  const params = nextActiveIssueId === undefined ? "" : `?next_active_issue_id=${encodeURIComponent(nextActiveIssueId ?? "")}`;
  await apiRequest<void>(`/rooms/${encodeURIComponent(roomId)}/issues/${encodeURIComponent(issueId)}${params}`, {
    errorCode: "deleteStory",
    hostToken,
    method: "DELETE",
  });
}

export async function archiveIssue(roomId: string, issueId: string, hostToken: string, nextActiveIssueId?: string | null) {
  return apiRequest<Issue>(`/rooms/${encodeURIComponent(roomId)}/issues/${encodeURIComponent(issueId)}/archive`, {
    body: { nextActiveIssueId: nextActiveIssueId ?? null },
    errorCode: "archiveStory",
    hostToken,
    method: "PATCH",
  });
}

export async function archiveEstimatedIssues(roomId: string, hostToken: string, nextActiveIssueId?: string | null) {
  return apiRequest<Issue[]>(`/rooms/${encodeURIComponent(roomId)}/issues/archive-estimated`, {
    body: { nextActiveIssueId: nextActiveIssueId ?? null },
    errorCode: "archiveEstimatedStories",
    hostToken,
  });
}

export async function unarchiveIssue(roomId: string, issueId: string, hostToken: string) {
  return apiRequest<Issue>(`/rooms/${encodeURIComponent(roomId)}/issues/${encodeURIComponent(issueId)}/unarchive`, {
    errorCode: "unarchiveStory",
    hostToken,
    method: "PATCH",
  });
}

export async function activateIssue(roomId: string, issueId: string, hostToken: string) {
  await apiRequest<void>(`/rooms/${encodeURIComponent(roomId)}/active-issue`, {
    body: { issueId },
    errorCode: "activateStory",
    hostToken,
    method: "PATCH",
  });
}

export async function saveIssueEstimate(issueId: string, value: string, hostToken: string) {
  await apiRequest<void>(`/issues/${encodeURIComponent(issueId)}/estimate`, {
    body: { value },
    errorCode: "saveEstimate",
    hostToken,
    method: "PATCH",
  });
}
