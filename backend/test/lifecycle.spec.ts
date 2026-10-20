import { createFixture } from "./fixture";

describe("Issue lifecycle", () => {
  it("imports, edits, estimates, archives, and deletes stories with old field semantics", async () => {
    const fixture = await createFixture();
    try {
      const { result, state: initial } = await fixture.createRoom();
      const room = initial.room;
      const roomId = room.id;
      const code = room.code;
      const hostHeaders = { "X-Host-Token": result.hostToken };
      const member = await fixture.addMember(code);
      const guestId = member.participant.id;
      const participantHeaders = { "X-Participant-Token": member.participantToken };

      let response = await fixture.request(
        "PATCH",
        `/api/rooms/${roomId}/active-issue`,
        { issueId: null },
        hostHeaders,
      );
      expect(response.status).toBe(204);

      response = await fixture.request("POST", `/api/rooms/${roomId}/issues/import`, { issues: [] }, hostHeaders);
      expect(response.status).toBe(201);
      expect(response.body).toEqual([]);

      response = await fixture.request(
        "POST",
        `/api/rooms/${roomId}/issues/import`,
        { issues: [{ title: "  " }] },
        hostHeaders,
      );
      expect(response.status).toBe(201);
      expect(response.body).toEqual([]);

      response = await fixture.request(
        "POST",
        `/api/rooms/${roomId}/issues/import`,
        { issues: [{ title: " " }, { title: " Seed ", estimate: " 5 " }, { title: " Later " }] },
        hostHeaders,
      );
      expect(response.status).toBe(201);
      expect(response.body).toHaveLength(2);
      const [first, second] = response.body;
      expect(first.title).toBe("Seed");
      expect(first.position).toBe(3);
      expect(first.estimate).toBe("5");
      expect(second.position).toBe(4);
      const seedId = first.id;
      const laterId = second.id;

      let loaded = await fixture.request("GET", `/api/rooms/${code}`, undefined, hostHeaders);
      expect(loaded.body.room.active_issue_id).toBe(seedId);

      response = await fixture.request(
        "PATCH",
        `/api/issues/${seedId}`,
        { title: " Revised ", description: " desc ", link: " link " },
        hostHeaders,
      );
      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Revised");
      expect(response.body.description).toBe("desc");

      response = await fixture.request("PATCH", `/api/issues/${seedId}/estimate`, { value: "8" }, hostHeaders);
      expect(response.status).toBe(204);

      response = await fixture.request(
        "PATCH",
        `/api/rooms/${roomId}/active-issue`,
        { issueId: seedId },
        hostHeaders,
      );
      expect(response.status).toBe(204);

      response = await fixture.request(
        "PATCH",
        `/api/rooms/${roomId}/issues/${seedId}/archive`,
        { nextActiveIssueId: laterId },
        hostHeaders,
      );
      expect(response.status).toBe(200);
      expect(response.body.archived_at).not.toBeNull();

      loaded = await fixture.request("GET", `/api/rooms/${code}`, undefined, hostHeaders);
      expect(loaded.body.room.active_issue_id).toBe(laterId);

      response = await fixture.request("PATCH", `/api/rooms/${roomId}/issues/${seedId}/unarchive`, undefined, hostHeaders);
      expect(response.status).toBe(200);
      expect(response.body.archived_at).toBeNull();

      response = await fixture.request(
        "POST",
        `/api/rooms/${roomId}/issues/archive-estimated`,
        { nextActiveIssueId: null },
        hostHeaders,
      );
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(seedId);

      response = await fixture.request("POST", `/api/participants/${guestId}/heartbeat`, undefined, participantHeaders);
      expect(response.status).toBe(204);

      response = await fixture.request(
        "PATCH",
        `/api/rooms/${roomId}/active-issue`,
        { issueId: laterId },
        hostHeaders,
      );
      expect(response.status).toBe(204);

      response = await fixture.request(
        "DELETE",
        `/api/rooms/${roomId}/issues/${laterId}?next_active_issue_id=${encodeURIComponent(seedId)}`,
        undefined,
        hostHeaders,
      );
      expect(response.status).toBe(204);

      loaded = await fixture.request("GET", `/api/rooms/${code}`, undefined, hostHeaders);
      expect(loaded.body.room.active_issue_id).toBe(seedId);
      expect(loaded.body.issues).toHaveLength(2);
      expect(loaded.body.issues.map((issue: any) => issue.id)).not.toContain(laterId);

      response = await fixture.request("DELETE", `/api/rooms/${roomId}/participants/${guestId}`, undefined, hostHeaders);
      expect(response.status).toBe(204);
      loaded = await fixture.request("GET", `/api/rooms/${code}`, undefined, hostHeaders);
      expect(loaded.body.participants).toHaveLength(1);
    } finally {
      await fixture.close();
    }
  });

  it("rejects cross-room resources without mutating the source room", async () => {
    const fixture = await createFixture();
    try {
      const first = await fixture.createRoom();
      const second = await fixture.createRoom();
      const firstRoom = first.state.room;
      const secondRoom = second.state.room;
      const firstIssue = first.state.issues[0];
      const secondIssue = second.state.issues[0];
      const firstParticipant = first.state.participants[0];
      const secondParticipant = second.state.participants[0];
      const host = { "X-Host-Token": second.result.hostToken };
      const participant = { "X-Participant-Token": first.result.participantToken };

      const cases = [
        {
          method: "POST",
          path: `/api/rooms/${firstRoom.id}/issues`,
          body: { title: "Denied" },
          headers: host,
          status: 403,
          detail: "hostAccessDenied",
        },
        {
          method: "PATCH",
          path: `/api/rooms/${secondRoom.id}/active-issue`,
          body: { issueId: firstIssue.id },
          headers: host,
          status: 404,
          detail: "storyNotFound",
        },
        {
          method: "PATCH",
          path: `/api/rooms/${secondRoom.id}/issues/${firstIssue.id}/archive`,
          body: { nextActiveIssueId: null },
          headers: host,
          status: 404,
          detail: "storyNotFound",
        },
        {
          method: "DELETE",
          path: `/api/rooms/${secondRoom.id}/issues/${firstIssue.id}`,
          headers: host,
          status: 404,
          detail: "storyNotFound",
        },
        {
          method: "DELETE",
          path: `/api/rooms/${secondRoom.id}/participants/${firstParticipant.id}`,
          headers: host,
          status: 404,
          detail: "participantNotFound",
        },
        {
          method: "PUT",
          path: `/api/rooms/${secondRoom.id}/issues/${secondIssue.id}/votes/${firstParticipant.id}`,
          body: { value: "3" },
          headers: participant,
          status: 404,
          detail: "roomNotFound",
        },
        {
          method: "POST",
          path: `/api/participants/${secondParticipant.id}/heartbeat`,
          headers: participant,
          status: 403,
          detail: "participantAccessDenied",
        },
      ];

      for (const testCase of cases) {
        const response = await fixture.request(testCase.method, testCase.path, testCase.body, testCase.headers);
        expect(response.status).toBe(testCase.status);
        expect(response.body.detail).toBe(testCase.detail);
      }

      const loaded = await fixture.request("GET", `/api/rooms/${firstRoom.code}`, undefined, {
        "X-Participant-Token": first.result.participantToken,
      });
      expect(loaded.status).toBe(200);
      expect(loaded.body.issues).toHaveLength(1);
      expect(loaded.body.issues[0].id).toBe(firstIssue.id);
    } finally {
      await fixture.close();
    }
  });
});
