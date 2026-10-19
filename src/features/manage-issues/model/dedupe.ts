import type { Issue } from "../../../entities/room/model/types";

export type DedupeMode = "link" | "title";

export type DuplicateIssueGroup = {
  key: string;
  keep: Issue;
  duplicates: Issue[];
};

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

// Link mode ignores stories without a link because there is nothing reliable
// to compare them by.
export function getIssueDuplicateKey(issue: Issue, mode: DedupeMode) {
  if (mode === "link") {
    const link = issue.link.trim();
    return link ? `link:${link.toLocaleLowerCase()}` : null;
  }

  return `title:${normalizeTitle(issue.title)}`;
}

function compareIssues(a: Issue, b: Issue, activeIssueId?: string | null) {
  const estimate = Number(Boolean(b.estimate)) - Number(Boolean(a.estimate));
  if (estimate !== 0) {
    return estimate;
  }

  const active = Number(b.id === activeIssueId) - Number(a.id === activeIssueId);
  if (active !== 0) {
    return active;
  }

  if (a.position !== b.position) {
    return a.position - b.position;
  }

  return a.created_at.localeCompare(b.created_at);
}

// Keeps the most valuable copy of every repeated story: an estimated story
// first, then the active one, then the earliest story in the queue.
export function findDuplicateGroups(issues: Issue[], activeIssueId: string | null | undefined, mode: DedupeMode): DuplicateIssueGroup[] {
  const groups = new Map<string, Issue[]>();

  for (const issue of issues) {
    const key = getIssueDuplicateKey(issue, mode);
    if (!key) {
      continue;
    }

    const group = groups.get(key);

    if (group) {
      group.push(issue);
    } else {
      groups.set(key, [issue]);
    }
  }

  const result: DuplicateIssueGroup[] = [];

  for (const [key, group] of groups) {
    if (group.length < 2) {
      continue;
    }

    const [keep, ...duplicates] = [...group].sort((a, b) => compareIssues(a, b, activeIssueId));
    result.push({ key, keep, duplicates });
  }

  return result;
}
