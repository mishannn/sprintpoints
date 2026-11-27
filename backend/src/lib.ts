import { MAX_ROOM_CODE_ATTEMPTS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@sprintpoints/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly detail: string,
  ) {
    super(detail);
  }
}

export const notFound = (detail: string) => new ApiError(404, detail);
export const forbidden = (detail: string) => new ApiError(403, detail);

export const now = () => new Date().toISOString();

export function fmt(value: string | null | undefined): string | null {
  if (!value) return null;
  const zoned = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(zoned);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/\.000Z$/, "Z");
}

export function tokenEq(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export const newId = () => crypto.randomUUID();

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
}

export function allocateCode(exists: (code: string) => boolean): string {
  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    const code = newCode();
    if (!exists(code)) return code;
  }
  throw new ApiError(503, "roomCodeUnavailable");
}

export function parseCardSet(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

type IssuePart = PropertyKey | { readonly key: PropertyKey };

export function formatIssues(
  issues: readonly { path?: readonly IssuePart[]; message: string }[],
): string {
  return (
    issues
      .map((issue) => {
        const path = (issue.path ?? [])
          .map((part) => (typeof part === "object" ? part.key : part))
          .filter((part) => part !== "body")
          .join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ") || "invalid request body"
  );
}
