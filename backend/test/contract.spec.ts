import { createFixture } from "./fixture";

describe("HTTP contract", () => {
  it("rejects malformed and incorrectly typed JSON with a 422 detail string", async () => {
    const fixture = await createFixture();
    try {
      const { state } = await fixture.createRoom();
      const code = state.room.code;
      const cases = [
        { body: `{"roomName":`, path: "/api/rooms" },
        {
          body: `{"roomName":8,"participantName":"Owner","defaults":{"roomName":"Fallback","facilitatorName":"Facilitator","firstStoryTitle":"First"}}`,
          path: "/api/rooms",
        },
        {
          body: `{"roomName":"Test","participantName":"Owner","defaults":{"roomName":"Fallback","facilitatorName":"Facilitator"}}`,
          path: "/api/rooms",
        },
        { body: `{"name":"Member"}`, path: `/api/rooms/${code}/join` },
        { body: `{"name":"Member","isSpectator":1}`, path: `/api/rooms/${code}/join` },
        { body: `{"issues":[{"title":"Valid"},{}]}`, path: `/api/rooms/${code}/issues/import` },
        { body: `{"title":null}`, path: `/api/rooms/${code}/issues` },
      ];

      for (const testCase of cases) {
        const response = await fetch(`${fixture.url}${testCase.path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: testCase.body,
        });
        const body = (await response.json()) as { detail?: unknown };
        expect(response.status).toBe(422);
        expect(typeof body.detail).toBe("string");
      }

      const joined = await fixture.request("POST", `/api/rooms/${code}/join`, { name: "Member", isSpectator: false });
      expect(joined.status).toBe(201);
      expect(joined.body.participant.is_spectator).toBe(false);
    } finally {
      await fixture.close();
    }
  });

  it("requires present nullable story reference fields", async () => {
    const fixture = await createFixture();
    try {
      const { state } = await fixture.createRoom();
      const roomId = state.room.id;
      const issueId = state.issues[0].id;
      const cases = [
        { method: "PATCH", path: `/api/rooms/${roomId}/active-issue`, field: "issueId" },
        { method: "PATCH", path: `/api/rooms/${roomId}/issues/${issueId}/archive`, field: "nextActiveIssueId" },
        { method: "POST", path: `/api/rooms/${roomId}/issues/archive-estimated`, field: "nextActiveIssueId" },
      ];
      for (const testCase of cases) {
        for (const body of [{}, { [testCase.field]: 1 }]) {
          const response = await fixture.request(testCase.method, testCase.path, body);
          expect(response.status).toBe(422);
        }
      }
    } finally {
      await fixture.close();
    }
  });

  it("serves documentation pages for HEAD and preserves 404/405 responses", async () => {
    const fixture = await createFixture();
    try {
      for (const path of ["/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"]) {
        const response = await fetch(`${fixture.url}${path}`, { method: "HEAD" });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("");
        expect(response.headers.get("content-length")).not.toBeNull();
      }

      const missing = await fixture.request("GET", "/missing");
      expect(missing.status).toBe(404);
      expect(missing.body.detail).toBe("Not Found");

      const wrongMethod = await fixture.request("POST", "/api/health");
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.body.detail).toBe("Method Not Allowed");

      const redirect = await fetch(`${fixture.url}/api/health/`, { redirect: "manual" });
      expect([301, 307, 308]).toContain(redirect.status);
    } finally {
      await fixture.close();
    }
  });

  it("applies configured browser origins and rejects denied preflights", async () => {
    const fixture = await createFixture(["https://allowed.example"]);
    try {
      for (const origin of ["https://allowed.example", "https://denied.example"]) {
        const response = await fetch(`${fixture.url}/api/rooms`, {
          method: "OPTIONS",
          headers: {
            Origin: origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-Host-Token",
          },
        });
        if (origin === "https://allowed.example") {
          expect(response.status).toBe(204);
          expect(response.headers.get("access-control-allow-origin")).toBe(origin);
        } else {
          expect(response.status).toBe(403);
        }
      }
    } finally {
      await fixture.close();
    }
  });
});
