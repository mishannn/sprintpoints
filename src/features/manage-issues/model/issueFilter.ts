import type { Issue } from "../../../entities/room/model/types";

export function matchesIssueQuery(issue: Issue, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [issue.title, issue.description, issue.link].some((value) =>
    value.toLocaleLowerCase().includes(normalizedQuery),
  );
}
