import { createFixture } from "./fixture";

describe("Votes", () => {
  it("upserts without changing vote identity, resets, and clears votes for spectators", async () => {
    const fixture = await createFixture();
    try {
      const { result, state } = await fixture.createRoom();
      const roomId = state.room.id;
      const code = state.room.code;
      const issueId = state.issues[0].id;
      const participantId = state.participants[0].id;
      const participantToken = result.participantToken;
      const votePath = `/api/rooms/${roomId}/issues/${issueId}/votes/${participantId}`;
      const participantHeaders = { "X-Participant-Token": participantToken };
      const hostHeaders = { "X-Host-Token": result.hostToken };

      expect((await fixture.request("PUT", votePath, { value: "3" }, participantHeaders)).status).toBe(204);
      let loaded = await fixture.request("GET", `/api/rooms/${code}`, undefined, participantHeaders);
      const before = loaded.body.votes[0];
      expect(before.value).toBe("3");

      expect((await fixture.request("PUT", votePath, { value: "5" }, participantHeaders)).status).toBe(204);
      loaded = await fixture.request("GET", `/api/rooms/${code}`, undefined, participantHeaders);
      const after = loaded.body.votes[0];
      expect(after.id).toBe(before.id);
      expect(after.created_at).toBe(before.created_at);
      expect(after.value).toBe("5");

      expect(
        (await fixture.request("POST", `/api/rooms/${roomId}/issues/${issueId}/reset-votes`, undefined, hostHeaders))
          .status,
      ).toBe(204);
      loaded = await fixture.request("GET", `/api/rooms/${code}`, undefined, participantHeaders);
      expect(loaded.body.votes).toHaveLength(0);

      expect((await fixture.request("PUT", votePath, { value: "8" }, participantHeaders)).status).toBe(204);
      expect(
        (
          await fixture.request(
            "PATCH",
            `/api/participants/${participantId}`,
            { isSpectator: true },
            participantHeaders,
          )
        ).status,
      ).toBe(200);
      loaded = await fixture.request("GET", `/api/rooms/${code}`, undefined, participantHeaders);
      expect(loaded.body.votes).toHaveLength(0);
    } finally {
      await fixture.close();
    }
  });

  it("leaves no vote when a vote races a spectator switch", async () => {
    const fixture = await createFixture();
    try {
      const { result, state } = await fixture.createRoom();
      const roomId = state.room.id;
      const code = state.room.code;
      const issueId = state.issues[0].id;
      const participantId = state.participants[0].id;
      const token = result.participantToken;
      const headers = { "X-Participant-Token": token };

      const [vote, spectator] = await Promise.all([
        fixture.request(
          "PUT",
          `/api/rooms/${roomId}/issues/${issueId}/votes/${participantId}`,
          { value: "3" },
          headers,
        ),
        fixture.request("PATCH", `/api/participants/${participantId}`, { isSpectator: true }, headers),
      ]);

      expect([204, 403]).toContain(vote.status);
      expect([200, 403]).toContain(spectator.status);

      const loaded = await fixture.request("GET", `/api/rooms/${code}`, undefined, headers);
      expect(loaded.body.votes).toHaveLength(0);
    } finally {
      await fixture.close();
    }
  });
});
