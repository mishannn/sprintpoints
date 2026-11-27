import { apiAuth, apiCall } from "../../../shared/api/client";
import {
  archiveEstimatedIssues as archiveEstimatedIssuesRequest,
  archiveIssue as archiveIssueRequest,
  createIssue as createIssueRequest,
  deleteIssue as deleteIssueRequest,
  importIssues as importIssuesRequest,
  setActiveIssue,
  setEstimate,
  unarchiveIssue as unarchiveIssueRequest,
  updateIssue as updateIssueRequest,
} from "../../../shared/api/generated";
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

  return apiCall(
    "addStory",
    createIssueRequest({
      path: { room: roomId },
      body: {
        title: trimmedTitle,
        description: details.description.trim(),
        link: details.link.trim(),
      },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  ) satisfies Promise<Issue | null>;
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

  return apiCall(
    "importStories",
    importIssuesRequest({
      path: { room: roomId },
      body: { issues },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  ) satisfies Promise<Issue[]>;
}

export async function updateIssueDetails(
  issueId: string,
  details: IssueDetailsInput,
  hostToken: string,
) {
  const trimmedTitle = details.title.trim();
  if (!trimmedTitle) {
    throw new AppError("storyTitleRequired");
  }

  return apiCall(
    "updateStory",
    updateIssueRequest({
      path: { issue: issueId },
      body: {
        title: trimmedTitle,
        description: details.description.trim(),
        link: details.link.trim(),
      },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  ) satisfies Promise<Issue>;
}

export async function deleteIssue(
  roomId: string,
  issueId: string,
  hostToken: string,
  nextActiveIssueId?: string | null,
) {
  await apiCall(
    "deleteStory",
    deleteIssueRequest({
      path: { room: roomId, issue: issueId },
      query:
        nextActiveIssueId === undefined
          ? undefined
          : { next_active_issue_id: nextActiveIssueId ?? "" },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  );
}

export async function archiveIssue(
  roomId: string,
  issueId: string,
  hostToken: string,
  nextActiveIssueId?: string | null,
) {
  return apiCall(
    "archiveStory",
    archiveIssueRequest({
      path: { room: roomId, issue: issueId },
      body: { nextActiveIssueId: nextActiveIssueId ?? null },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  ) satisfies Promise<Issue>;
}

export async function archiveEstimatedIssues(
  roomId: string,
  hostToken: string,
  nextActiveIssueId?: string | null,
) {
  return apiCall(
    "archiveEstimatedStories",
    archiveEstimatedIssuesRequest({
      path: { room: roomId },
      body: { nextActiveIssueId: nextActiveIssueId ?? null },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  ) satisfies Promise<Issue[]>;
}

export async function unarchiveIssue(roomId: string, issueId: string, hostToken: string) {
  return apiCall(
    "unarchiveStory",
    unarchiveIssueRequest({
      path: { room: roomId, issue: issueId },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  ) satisfies Promise<Issue>;
}

export async function activateIssue(roomId: string, issueId: string, hostToken: string) {
  await apiCall(
    "activateStory",
    setActiveIssue({
      path: { room: roomId },
      body: { issueId },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  );
}

export async function saveIssueEstimate(issueId: string, value: string, hostToken: string) {
  await apiCall(
    "saveEstimate",
    setEstimate({
      path: { issue: issueId },
      body: { value },
      auth: apiAuth({ hostToken }),
      throwOnError: true,
    }),
  );
}
