import type { Issue } from "../../../entities/room/model/types";
import type { IssueDetailsInput } from "./issues";

export type CsvData = {
  headers: string[];
  rows: string[][];
};

export type JiraImportMapping = {
  title: number | null;
  description: number | null;
  link: number | null;
  estimate: number | null;
};

export type ImportedIssueInput = IssueDetailsInput & {
  estimate: string;
};

const jiraExportHeaders = ["Summary", "Issue key", "Issue Type", "Status", "Description", "Story Points", "Issue URL"];

const titleCandidates = ["summary", "тема", "title", "название", "краткое описание"];
const descriptionCandidates = ["description", "описание"];
const linkCandidates = ["issue key", "ключ проблемы", "key", "url", "ссылка"];
const estimateCandidates = ["story points", "story point estimate", "оценка", "оценка времени", "original story points"];

function normalizeHeader(value: string) {
  return value
    .trim()
    .replace(/^пользовательское поле\s*\((.*)\)$/i, "$1")
    .toLocaleLowerCase();
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const exactIndex = normalizedHeaders.findIndex((header) => candidates.some((candidate) => header === candidate));

  if (exactIndex >= 0) {
    return exactIndex;
  }

  return normalizedHeaders.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
}

function readCell(row: string[], index: number | null) {
  return index === null ? "" : (row[index] ?? "").trim();
}

function truncateTitle(value: string) {
  return value.trim().slice(0, 240);
}

function applyLinkPattern(value: string, pattern: string) {
  const trimmedValue = value.trim();
  const trimmedPattern = pattern.trim();

  if (!trimmedValue || !trimmedPattern) {
    return trimmedValue;
  }

  if (/\{VALUE\}/i.test(trimmedPattern)) {
    return trimmedPattern.replace(/\{VALUE\}/gi, trimmedValue);
  }

  return `${trimmedPattern}${trimmedValue}`;
}

export function getInitialJiraImportMapping(headers: string[]): JiraImportMapping {
  const title = findHeaderIndex(headers, titleCandidates);
  const description = findHeaderIndex(headers, descriptionCandidates);
  const link = findHeaderIndex(headers, linkCandidates);
  const estimate = findHeaderIndex(headers, estimateCandidates);

  return {
    title: title >= 0 ? title : null,
    description: description >= 0 ? description : null,
    link: link >= 0 ? link : null,
    estimate: estimate >= 0 ? estimate : null,
  };
}

export function parseCsv(text: string): CsvData {
  const records: string[][] = [];
  const input = text.replace(/^\uFEFF/, "");
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const [headers = [], ...rows] = records.filter((item) => item.some((cell) => cell.trim()));
  return { headers, rows };
}

export function mapJiraCsvRows(data: CsvData, mapping: JiraImportMapping, linkPattern = ""): ImportedIssueInput[] {
  if (mapping.title === null) {
    return [];
  }

  return data.rows
    .map((row) => ({
      title: truncateTitle(readCell(row, mapping.title)),
      description: readCell(row, mapping.description),
      link: applyLinkPattern(readCell(row, mapping.link), linkPattern),
      estimate: readCell(row, mapping.estimate),
    }))
    .filter((issue) => issue.title);
}

function escapeCsvCell(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function getIssueKey(issue: Issue) {
  const link = issue.link.trim();
  const match = link.match(/[A-Z][A-Z0-9]+-\d+/);
  return match?.[0] ?? "";
}

export function serializeIssuesToJiraCsv(issues: Issue[]) {
  const rows = issues.map((issue) => [
    issue.title,
    getIssueKey(issue),
    "Story",
    "To Do",
    issue.description,
    issue.estimate ?? "",
    issue.link,
  ]);

  return [jiraExportHeaders, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

export function downloadJiraCsv(issues: Issue[], roomName: string) {
  const csv = serializeIssuesToJiraCsv(issues);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = roomName.trim().replace(/[^a-z0-9а-яё_-]+/gi, "-") || "planning-poker";

  link.href = url;
  link.download = `${safeName}-jira.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
