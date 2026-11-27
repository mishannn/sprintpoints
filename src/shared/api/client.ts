import type { AppErrorCode } from "../lib/AppError";
import { AppError } from "../lib/AppError";
import {
  ADMIN_TOKEN_HEADER,
  HOST_TOKEN_HEADER,
  PARTICIPANT_TOKEN_HEADER,
  roomWebSocketPath,
} from "../../../shared/constants";
import type { Auth } from "./generated/client";
import { client } from "./generated/client.gen";

const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
export const apiBaseUrl = configuredApiUrl?.replace(/\/$/, "") || "/api";
export const hasApiConfig = true;

// Generated operation paths already start with /api, so strip the trailing
// /api from VITE_API_URL and keep the origin or any custom path prefix.
const apiRoot = apiBaseUrl.replace(/\/api$/, "");
client.setConfig({
  baseUrl: /^https?:\/\//i.test(apiRoot)
    ? apiRoot
    : `${globalThis.location?.origin ?? ""}${apiRoot}`,
});

export type ApiAuth = {
  adminToken?: string | null;
  hostToken?: string | null;
  participantToken?: string | null;
};

export function apiAuth(tokens: ApiAuth) {
  return (scheme: Auth) => {
    if (scheme.name === HOST_TOKEN_HEADER) return tokens.hostToken ?? undefined;
    if (scheme.name === PARTICIPANT_TOKEN_HEADER) return tokens.participantToken ?? undefined;
    if (scheme.name === ADMIN_TOKEN_HEADER) return tokens.adminToken ?? undefined;
    return undefined;
  };
}

export async function apiCall<T>(
  errorCode: AppErrorCode,
  request: Promise<{ data: T }>,
): Promise<T> {
  try {
    return (await request).data;
  } catch (error) {
    const detail =
      error && typeof error === "object" && "detail" in error
        ? (error as { detail?: unknown }).detail
        : undefined;
    throw new AppError(errorCode, {
      message:
        typeof detail === "string"
          ? detail
          : error instanceof Error
            ? error.message
            : undefined,
      cause: error,
    });
  }
}

type RoomEventsAuth = {
  participantToken?: string | null;
  hostToken?: string | null;
};

export function roomEventsUrl(roomId: string, auth: RoomEventsAuth): string {
  const base = /^https?:\/\//i.test(apiBaseUrl)
    ? apiBaseUrl.replace(/^http/i, "ws")
    : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}${apiBaseUrl}`;

  const params = new URLSearchParams();
  if (auth.participantToken) {
    params.set("participantToken", auth.participantToken);
  }
  if (auth.hostToken) {
    params.set("hostToken", auth.hostToken);
  }
  const query = params.toString();
  return `${base}${roomWebSocketPath(roomId)}${query ? `?${query}` : ""}`;
}
