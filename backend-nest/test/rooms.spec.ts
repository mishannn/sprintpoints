import { createFixture } from "./fixture";

describe("Rooms", () => {
  it("keeps tokens private and rotates host credentials on ownership transfer", async () => {
    const fixture = await createFixture();
    try {
      const { result, state } = await fixture.createRoom();
      const room = state.room;
      const roomId = room.id;
      const code = room.code;
      const hostToken = result.hostToken;
      const member = await fixture.addMember(code);
      const memberId = member.participant.id;
      const memberToken = member.participantToken;

      const hidden = await fixture.request("GET", `/api/rooms/${code}`, undefined, {
        "X-Participant-Token": memberToken,
      });
      expect(hidden.status).toBe(200);
      expect(hidden.body.room.host_token).toBe("");
      for (const participant of hidden.body.participants) {
        if (participant.id !== memberId) {
          expect(participant.token).toBe("");
        }
      }

      const transfer = await fixture.request(
        "POST",
        `/api/rooms/${roomId}/transfer-ownership`,
        { participantId: memberId },
        { "X-Host-Token": hostToken },
      );
      expect(transfer.status).toBe(204);

      const newState = await fixture.request("GET", `/api/rooms/${code}`, undefined, {
        "X-Participant-Token": memberToken,
      });
      expect(newState.status).toBe(200);
      const newHost = newState.body.room.host_token;
      expect(newHost).not.toBe("");
      expect(newHost).not.toBe(hostToken);

      const stale = await fixture.request(
        "POST",
        `/api/rooms/${roomId}/issues`,
        { title: "stale", description: "", link: "" },
        { "X-Host-Token": hostToken },
      );
      expect(stale.status).toBe(403);

      const created = await fixture.request(
        "POST",
        `/api/rooms/${roomId}/issues`,
        { title: "new owner", description: "", link: "" },
        { "X-Host-Token": newHost },
      );
      expect(created.status).toBe(201);
    } finally {
      await fixture.close();
    }
  });
});
