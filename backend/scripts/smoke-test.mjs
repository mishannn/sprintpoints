#!/usr/bin/env node
/**
 * End-to-end smoke test for the Sprint Points API.
 *
 * Usage:
 *   node scripts/smoke-test.mjs [BASE_URL]
 *
 * Defaults to http://127.0.0.1:8787. Works against a deployed Worker too.
 */

const BASE_URL = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/, "");
const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://mishannn.github.io";

async function request(method, path, body, { hostToken, participantToken, headers } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(hostToken ? { "X-Host-Token": hostToken } : {}),
      ...(participantToken ? { "X-Participant-Token": participantToken } : {}),
      ...headers,
    },
  });
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }
  }
  return { status: response.status, body: payload };
}

function expect(condition, label, detail) {
  if (!condition) {
    throw new Error(`FAILED: ${label}\n${JSON.stringify(detail)}`);
  }
  console.log(`ok  ${label}`);
}

async function main() {
  let result = await request("OPTIONS", "/api/rooms", undefined, {
    headers: { Origin: CORS_ORIGIN },
  });
  expect(result.status === 204, "CORS preflight allowed", result.status);

  result = await request("POST", "/api/rooms", {
    roomName: "Smoke room",
    participantName: "Host",
    defaults: {
      roomName: "Default",
      facilitatorName: "Facilitator",
      firstStoryTitle: "Story one",
    },
  });
  expect(result.status === 201, "create room -> 201", result);
  const created = result.body;
  const hostToken = created.hostToken;
  const participantToken = created.participantToken;
  const code = created.state.room.code;
  const roomId = created.state.room.id;
  const issueId = created.state.issues[0].id;
  const ownerId = created.state.room.owner_id;
  expect(created.state.room.host_token === hostToken, "host token revealed to creator");

  result = await request("GET", `/api/rooms/${code}`, undefined, { hostToken });
  expect(
    result.status === 200 && result.body.room.id === roomId,
    "load room by code",
    result,
  );
  expect(result.body.room.host_token === hostToken, "state shows host token to host");

  result = await request("GET", `/api/rooms/${code.toLowerCase()}`, undefined, {
    participantToken,
  });
  expect(result.status === 200, "room code is case insensitive", result);
  expect(result.body.room.host_token === hostToken, "owner participant sees host token");

  result = await request("GET", `/api/rooms/${code}`);
  expect(
    result.status === 403 && result.body.detail === "roomAccessDenied",
    "load without token -> 403",
    result,
  );

  result = await request("POST", `/api/rooms/${code}/join`, {
    name: "Guest",
    isSpectator: false,
  });
  expect(result.status === 201, "join room -> 201", result);
  const guestToken = result.body.participantToken;
  const guestId = result.body.participant.id;
  expect(result.body.participant.token === guestToken, "join returns own token");

  result = await request(
    "PUT",
    `/api/rooms/${roomId}/issues/${issueId}/votes/${guestId}`,
    { value: "5" },
    { participantToken: guestToken },
  );
  expect(result.status === 204, "cast vote -> 204", result);

  result = await request("GET", `/api/rooms/${code}`, undefined, { hostToken });
  expect(
    result.body.votes.length === 1 && result.body.votes[0].value === "5",
    "vote persisted",
    result.body.votes,
  );

  result = await request("PATCH", `/api/rooms/${roomId}/reveal`, undefined, { hostToken });
  expect(result.status === 204, "reveal -> 204", result.status);
  result = await request("GET", `/api/rooms/${code}`, undefined, { hostToken });
  expect(result.body.room.revealed === true, "room revealed");

  result = await request(
    "POST",
    `/api/rooms/${roomId}/issues/${issueId}/reset-votes`,
    undefined,
    { hostToken },
  );
  expect(result.status === 204, "reset votes -> 204", result);
  result = await request("GET", `/api/rooms/${code}`, undefined, { hostToken });
  expect(
    result.body.votes.length === 0 && result.body.room.revealed === false,
    "votes cleared and votes hidden",
  );

  result = await request(
    "POST",
    `/api/rooms/${roomId}/issues`,
    { title: "Story two", description: " d ", link: " https://example.com " },
    { hostToken },
  );
  expect(result.status === 201, "create story -> 201", result);
  expect(
    result.body.description === "d" && result.body.link === "https://example.com",
    "story fields trimmed",
    result,
  );
  const secondIssue = result.body.id;

  result = await request("GET", `/api/rooms/${code}`, undefined, { hostToken });
  expect(result.body.room.active_issue_id === secondIssue, "new story becomes active");

  result = await request(
    "PATCH",
    `/api/issues/${secondIssue}/estimate`,
    { value: "8" },
    { hostToken },
  );
  expect(result.status === 204, "set estimate -> 204", result.status);

  result = await request(
    "POST",
    `/api/rooms/${roomId}/issues/archive-estimated`,
    { nextActiveIssueId: issueId },
    { hostToken },
  );
  expect(
    result.status === 200 && result.body.length === 1,
    "archive estimated -> 200",
    result,
  );
  result = await request("GET", `/api/rooms/${code}`, undefined, { hostToken });
  expect(result.body.room.active_issue_id === issueId, "archive estimated moves active story");

  result = await request(
    "PATCH",
    `/api/rooms/${roomId}/issues/${secondIssue}/unarchive`,
    undefined,
    { hostToken },
  );
  expect(
    result.status === 200 && result.body.archived_at === null,
    "unarchive -> 200",
    result,
  );

  result = await request(
    "POST",
    `/api/rooms/${roomId}/issues/import`,
    {
      issues: [
        { title: "Imported A" },
        { title: "   " },
        { title: "Imported B", estimate: "3" },
      ],
    },
    { hostToken },
  );
  expect(
    result.status === 201 && result.body.length === 2,
    "import stories skips blanks",
    result,
  );
  expect(result.body[1].estimate === "3", "import keeps estimate", result.body);

  result = await request(
    "PATCH",
    `/api/rooms/${roomId}/active-issue`,
    { issueId: secondIssue },
    { hostToken },
  );
  expect(result.status === 204, "set active story -> 204", result.status);

  result = await request(
    "PATCH",
    `/api/rooms/${roomId}/active-issue`,
    { issueId: null },
    { hostToken },
  );
  expect(result.status === 204, "clear active story -> 204", result.status);
  result = await request("PATCH", `/api/rooms/${roomId}/active-issue`, {}, { hostToken });
  expect(result.status === 422, "active issue id is required", result);

  result = await request(
    "PATCH",
    `/api/participants/${guestId}`,
    { isSpectator: true },
    { participantToken: guestToken },
  );
  expect(
    result.status === 200 && result.body.is_spectator === true,
    "toggle spectator",
    result,
  );

  result = await request(
    "PUT",
    `/api/rooms/${roomId}/issues/${issueId}/votes/${guestId}`,
    { value: "3" },
    { participantToken: guestToken },
  );
  expect(
    result.status === 403 && result.body.detail === "spectatorsCannotVote",
    "spectators cannot vote",
    result,
  );

  result = await request(
    "POST",
    `/api/participants/${guestId}/heartbeat`,
    undefined,
    { participantToken: guestToken },
  );
  expect(result.status === 204, "heartbeat -> 204", result.status);

  result = await request(
    "POST",
    `/api/rooms/${roomId}/transfer-ownership`,
    { participantId: guestId },
    { hostToken },
  );
  expect(result.status === 204, "transfer ownership -> 204", result);
  result = await request("GET", `/api/rooms/${code}`, undefined, { participantToken: guestToken });
  expect(result.body.room.owner_id === guestId, "new owner recorded");

  result = await request(
    "POST",
    `/api/rooms/${roomId}/transfer-ownership`,
    { participantId: ownerId },
    { hostToken },
  );
  expect(result.status === 403, "old host token rejected after transfer", result);

  result = await request(
    "DELETE",
    `/api/issues/${issueId}/votes/${guestId}`,
    undefined,
    { participantToken: guestToken },
  );
  expect(result.status === 204, "delete vote -> 204", result.status);

  result = await request("POST", "/api/rooms", { participantName: "Host", defaults: {} });
  expect(result.status === 422, "missing body fields -> 422", result);

  result = await request("GET", "/api/rooms/ZZZZZZ");
  expect(
    result.status === 404 && result.body.detail === "roomNotFound",
    "unknown room -> 404",
    result,
  );

  result = await request("DELETE", "/api/rooms");
  expect(
    result.status === 405 && result.body.detail === "Method Not Allowed",
    "wrong method -> 405",
    result,
  );

  console.log("\nAll smoke checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
