import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

const ORIGIN = "https://example.com";

const CREATE_BODY = {
  roomName: "Sprint",
  participantName: "Host",
  defaults: {
    roomName: "Planning",
    facilitatorName: "Facilitator",
    firstStoryTitle: "First story",
  },
};

type Json = Record<string, any>;

async function request(path: string, init: RequestInit = {}) {
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, init));
}

async function body(path: string, init: RequestInit = {}) {
  const response = await request(path, init);
  const text = await response.text();
  return { status: response.status, json: text ? (JSON.parse(text) as Json) : null };
}

function jsonInit(method: string, value: unknown, headers: Record<string, string> = {}) {
  return {
    method,
    body: JSON.stringify(value),
    headers: { "content-type": "application/json", ...headers },
  };
}

const ADMIN = { "X-Admin-Token": "test-admin" };

beforeEach(async () => {
  const reset = await body(
    "/api/admin/import",
    jsonInit("POST", { rooms: [], participants: [], issues: [], votes: [] }, ADMIN),
  );
  expect(reset.status).toBe(200);
});

async function createRoom() {
  const result = await body("/api/rooms", jsonInit("POST", CREATE_BODY));
  expect(result.status).toBe(201);
  return result.json!;
}

async function join(code: string, name = "Guest", spectator = false) {
  const result = await body(
    `/api/rooms/${code}/join`,
    jsonInit("POST", { name, isSpectator: spectator }),
  );
  expect(result.status).toBe(201);
  return result.json!;
}

describe("HTTP surface", () => {
  it("health, JSON errors, redirects and CORS", async () => {
    expect(await body("/api/health")).toEqual({ status: 200, json: { status: "ok" } });

    const missing = await body("/api/missing");
    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({ detail: "Not Found" });

    const wrongMethod = await body("/api/health", { method: "PUT" });
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.json).toEqual({ detail: "Method Not Allowed" });

    const redirect = await request("/api/health/", { redirect: "manual" });
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe(`${ORIGIN}/api/health`);

    const preflight = await request("/api/rooms", {
      method: "OPTIONS",
      headers: {
        Origin: "https://allowed.example",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://allowed.example");

    const deniedPreflight = await request("/api/rooms", {
      method: "OPTIONS",
      headers: {
        Origin: "https://denied.example",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(deniedPreflight.status).toBe(403);

    const malformed = await request("/api/rooms", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json", Origin: "https://allowed.example" },
    });
    expect(malformed.status).toBe(422);
    expect(malformed.headers.get("access-control-allow-origin")).toBe("https://allowed.example");
    expect(await malformed.json()).toEqual({ detail: "invalid request body" });
  });

  it("serves generated OpenAPI", async () => {
    const result = await body("/api/openapi.json");
    expect(result.status).toBe(200);
    expect(result.json!.openapi).toBe("3.1.0");
    expect(Object.keys(result.json!.paths)).toHaveLength(23);
    expect(result.json!.paths["/api/rooms/{room}/issues/{issue}"].delete.operationId).toBe(
      "deleteIssue",
    );
    expect(result.json!.components.securitySchemes.HostToken.name).toBe("X-Host-Token");
    expect(
      result.json!.paths["/api/rooms/{room}/issues/{issue}/votes/{participant}"].put.requestBody
        .content["application/json"].schema.required,
    ).toEqual(["value"]);
  });

  it("creates, joins and authorizes a room", async () => {
    const created = await createRoom();
    const room = created.state.room;
    expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(room.host_token).toBe(created.hostToken);
    expect(room.card_set).toEqual(["0", "1", "2", "3", "5", "8", "13", "21", "?", "Coffee"]);
    expect(room.revealed).toBe(false);
    expect(created.state.participants[0].token).toBe(created.participantToken);

    const guest = await join(room.code.toLowerCase(), " Guest ");
    expect(guest.room.host_token).toBe("");
    expect(guest.participant.name).toBe("Guest");
    expect(guest.participant.token).toBe(guest.participantToken);

    const participantView = await body(`/api/rooms/${room.code}`, {
      headers: { "X-Participant-Token": guest.participantToken },
    });
    expect(participantView.status).toBe(200);
    expect(participantView.json!.room.host_token).toBe("");

    const hostView = await body(`/api/rooms/${room.code}`, {
      headers: { "X-Host-Token": created.hostToken },
    });
    expect(hostView.json!.room.host_token).toBe(created.hostToken);

    const ownerView = await body(`/api/rooms/${room.code}`, {
      headers: { "X-Participant-Token": created.participantToken },
    });
    expect(ownerView.json!.room.host_token).toBe(created.hostToken);

    const denied = await body(`/api/rooms/${room.code}`);
    expect(denied.status).toBe(403);
    expect(denied.json).toEqual({ detail: "roomAccessDenied" });
  });
});

describe("voting and stories", () => {
  it("votes, reveals and resets", async () => {
    const created = await createRoom();
    const room = created.state.room;
    const guest = await join(room.code, "Guest");
    const host = { "X-Host-Token": created.hostToken };
    const voter = { "X-Participant-Token": guest.participantToken };
    const votePath = `/api/rooms/${room.id}/issues/${room.active_issue_id}/votes/${guest.participant.id}`;

    expect((await body(votePath, jsonInit("PUT", { value: "8" }, voter))).status).toBe(204);

    let state = await body(`/api/rooms/${room.code}`, { headers: voter });
    expect(state.json!.votes).toHaveLength(1);
    expect(state.json!.votes[0].value).toBe("8");

    expect(
      (await body(`/api/rooms/${room.id}/reveal`, { method: "PATCH", headers: host })).status,
    ).toBe(204);
    state = await body(`/api/rooms/${room.code}`, { headers: voter });
    expect(state.json!.room.revealed).toBe(true);

    expect(
      (
        await body(`/api/rooms/${room.id}/issues/${room.active_issue_id}/reset-votes`, {
          method: "POST",
          headers: host,
        })
      ).status,
    ).toBe(204);
    state = await body(`/api/rooms/${room.code}`, { headers: voter });
    expect(state.json!.votes).toEqual([]);
    expect(state.json!.room.revealed).toBe(false);

    const spectator = await join(room.code, "Observer", true);
    const forbidden = await body(votePath.replace(guest.participant.id, spectator.participant.id), {
      ...jsonInit("PUT", { value: "5" }),
      headers: {
        "content-type": "application/json",
        "X-Participant-Token": spectator.participantToken,
      },
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.json).toEqual({ detail: "spectatorsCannotVote" });
  });

  it("manages the story queue", async () => {
    const created = await createRoom();
    const room = created.state.room;
    const host = { "X-Host-Token": created.hostToken };

    let result = await body(
      `/api/rooms/${room.id}/issues`,
      jsonInit("POST", { title: "  Second  ", description: null, link: null }, host),
    );
    expect(result.status).toBe(201);
    expect(result.json!.title).toBe("Second");
    expect(result.json!.position).toBe(2);
    const issueId = result.json!.id;

    result = await body(
      `/api/issues/${issueId}`,
      jsonInit("PATCH", { title: "Renamed", description: "Desc", link: "https://x" }, host),
    );
    expect(result.json!.title).toBe("Renamed");

    result = await body(
      `/api/rooms/${room.id}/issues/${issueId}/archive`,
      jsonInit("PATCH", { nextActiveIssueId: null }, host),
    );
    expect(result.status).toBe(200);
    expect(result.json!.archived_at).toBeTruthy();

    result = await body(`/api/rooms/${room.id}/issues/${issueId}/unarchive`, {
      method: "PATCH",
      headers: host,
    });
    expect(result.json!.archived_at).toBeNull();

    result = await body(
      `/api/issues/${issueId}/estimate`,
      jsonInit("PATCH", { value: "13" }, host),
    );
    expect(result.status).toBe(204);

    result = await body(
      `/api/rooms/${room.id}/issues/archive-estimated`,
      jsonInit("POST", { nextActiveIssueId: null }, host),
    );
    expect(result.status).toBe(200);
    expect(result.json!.map((issue: Json) => issue.id)).toEqual([issueId]);

    result = await body(`/api/rooms/${room.id}/issues/${issueId}?next_active_issue_id=`, {
      method: "DELETE",
      headers: host,
    });
    expect(result.status).toBe(204);

    result = await body(`/api/rooms/${room.id}/issues`, jsonInit("POST", { title: "   " }, host));
    expect(result.status).toBe(201);
    expect(result.json).toBeNull();

    result = await body(
      `/api/rooms/${room.id}/issues/import`,
      jsonInit(
        "POST",
        {
          issues: [
            { title: " A ", description: "d", link: "l", estimate: " 3 " },
            { title: "  " },
            { title: "B", estimate: null },
          ],
        },
        host,
      ),
    );
    expect(result.status).toBe(201);
    expect(result.json!.map((issue: Json) => issue.title)).toEqual(["A", "B"]);
    expect(result.json![0].estimate).toBe("3");
    expect(result.json![1].position - result.json![0].position).toBe(2);
  });
});

describe("admin", () => {
  it("exports and replaces data", async () => {
    await createRoom();
    const admin = ADMIN;

    const exported = await body("/api/admin/export", { headers: admin });
    expect(exported.status).toBe(200);
    const dump = exported.json!;
    expect(dump.rooms).toHaveLength(1);
    expect(dump.participants).toHaveLength(1);
    expect(dump.issues).toHaveLength(1);
    expect(dump.rooms[0].revealed).toBe(0);

    const imported = await body("/api/admin/import", jsonInit("POST", dump, admin));
    expect(imported.status).toBe(200);
    expect(imported.json).toEqual({ rooms: 1, participants: 1, issues: 1, votes: 0 });

    const wrapped = await body("/api/admin/import", jsonInit("POST", { data: dump }, admin));
    expect(wrapped.status).toBe(200);

    const invalid = await body(
      "/api/admin/import",
      jsonInit("POST", { rooms: [], participants: [{ id: "p", room_id: "missing" }] }, admin),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.json!.detail).toContain("unknown room");

    const forbidden = await body("/api/admin/export", {
      headers: { "X-Admin-Token": "wrong" },
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.json).toEqual({ detail: "adminAccessDenied" });
  });
});

describe("websocket", () => {
  it("accepts members and broadcasts updates", async () => {
    const created = await createRoom();
    const room = created.state.room;
    const response = await request(
      `/api/rooms/${room.id}/ws?participantToken=${created.participantToken}`,
      { headers: { Upgrade: "websocket" } },
    );
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    socket.accept();
    const message = new Promise<string>((resolve, reject) => {
      socket.addEventListener("message", (event) => resolve(String(event.data)));
      setTimeout(() => reject(new Error("no broadcast")), 3000);
    });

    const createdIssue = await body(
      `/api/rooms/${room.id}/issues`,
      jsonInit("POST", { title: "Broadcast me" }, { "X-Host-Token": created.hostToken }),
    );
    expect(createdIssue.status).toBe(201);
    expect(JSON.parse(await message)).toEqual({ type: "room_updated" });
    socket.close();

    const denied = await request(`/api/rooms/${room.id}/ws`, {
      headers: { Upgrade: "websocket" },
    });
    expect(denied.status).toBe(403);

    const notUpgrade = await request(`/api/rooms/${room.id}/ws`);
    expect(notUpgrade.status).toBe(426);
  });
});

it("has a typed test environment", () => {
  expect(env.ROOMS).toBeDefined();
});
