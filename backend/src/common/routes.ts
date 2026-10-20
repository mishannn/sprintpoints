export const HEALTH_PATH = "/api/health";

export type RouteDefinition = {
  method: string;
  path: string;
};

const methods = ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"];

/**
 * The routes exposed by the Go service. Nest's router only registers handlers
 * for implemented methods, so this table preserves the old 404 vs 405 split
 * and lets HEAD work on documentation pages.
 */
export const API_ROUTES: RouteDefinition[] = [
  { method: "GET", path: "/api/health" },
  { method: "POST", path: "/api/rooms" },
  { method: "POST", path: "/api/rooms/:room/join" },
  { method: "GET", path: "/api/rooms/:room" },
  { method: "POST", path: "/api/rooms/:room/transfer-ownership" },
  { method: "POST", path: "/api/participants/:participant/heartbeat" },
  { method: "PATCH", path: "/api/participants/:participant" },
  { method: "DELETE", path: "/api/rooms/:room/participants/:participant" },
  { method: "POST", path: "/api/rooms/:room/issues" },
  { method: "POST", path: "/api/rooms/:room/issues/import" },
  { method: "PATCH", path: "/api/issues/:issue" },
  { method: "DELETE", path: "/api/rooms/:room/issues/:issue" },
  { method: "PATCH", path: "/api/rooms/:room/issues/:issue/archive" },
  { method: "POST", path: "/api/rooms/:room/issues/archive-estimated" },
  { method: "PATCH", path: "/api/rooms/:room/issues/:issue/unarchive" },
  { method: "PATCH", path: "/api/rooms/:room/active-issue" },
  { method: "PATCH", path: "/api/issues/:issue/estimate" },
  { method: "PUT", path: "/api/rooms/:room/issues/:issue/votes/:participant" },
  { method: "PATCH", path: "/api/rooms/:room/reveal" },
  { method: "POST", path: "/api/rooms/:room/issues/:issue/reset-votes" },
  { method: "DELETE", path: "/api/issues/:issue/votes/:participant" },
  { method: "GET", path: "/api/rooms/:room/ws" },
  ...["/openapi.json", "/docs", "/redoc", "/docs/oauth2-redirect"].flatMap((path) =>
    methods.map((method) => ({ method, path })),
  ),
];

const patterns = API_ROUTES.map((route) => ({
  ...route,
  regex: compile(route.path),
}));

export function isKnownPath(path: string): boolean {
  return patterns.some((route) => route.regex.test(normalize(path)));
}

export function isKnownRoute(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalize(path);
  return patterns.some((route) => route.method === normalizedMethod && route.regex.test(normalizedPath));
}

function compile(path: string): RegExp {
  const body = path
    .split("/")
    .map((part) => (part.startsWith(":") ? "[^/]+" : escapeRegExp(part)))
    .join("/");
  return new RegExp(`^${body}/?$`);
}

function normalize(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.replace(/\/+$/, "");
  }
  return path;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
