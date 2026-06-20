import type { AppErrorCode } from "../lib/AppError";
import { AppError } from "../lib/AppError";

const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
export const apiBaseUrl = (configuredApiUrl?.replace(/\/$/, "") || "/api");
export const hasApiConfig = true;

type RequestOptions = {
  body?: unknown;
  errorCode: AppErrorCode;
  hostToken?: string | null;
  method?: string;
  participantToken?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const headers = new Headers();

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.hostToken) {
    headers.set("X-Host-Token", options.hostToken);
  }

  if (options.participantToken) {
    headers.set("X-Participant-Token", options.participantToken);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = (await response.json()) as { detail?: string };
      message = payload.detail ?? message;
    } catch {
      // Fall back to status text when the backend returns an empty response.
    }
    throw new AppError(options.errorCode, { message });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
