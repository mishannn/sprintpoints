import { createFixture } from "./fixture";

const legacyRoomId = "11111111-1111-4111-8111-111111111111";
const legacyOwnerId = "22222222-2222-4222-8222-222222222222";
const legacyMemberId = "33333333-3333-4333-8333-333333333333";
const legacyIssueId = "44444444-4444-4444-8444-444444444444";
const legacyRoomCode = "LEGACY";
const legacyHostToken = "legacy-host-token";
const legacyMemberToken = "legacy-member-token";
const legacyOwnerToken = "legacy-owner-token";

const persistedSQL = `
BEGIN;
INSERT INTO rooms (id, code, name, host_token, card_set, revealed, active_issue_id, created_at, updated_at, owner_id) VALUES('${legacyRoomId}','${legacyRoomCode}','Cross-version','${legacyHostToken}','["0", "1", "2", "3", "5", "8", "13", "21", "?", "Coffee"]',0,'${legacyIssueId}','2025-01-02 03:04:05.000000','2025-01-02 03:04:05.000000','${legacyOwnerId}');
INSERT INTO "participants" VALUES('${legacyOwnerId}','${legacyRoomId}','Owner','${legacyOwnerToken}',0,'2025-01-02 03:04:05.000000','2025-01-02 03:04:05.000000');
INSERT INTO "participants" VALUES('${legacyMemberId}','${legacyRoomId}','Persisted member','${legacyMemberToken}',0,'2025-01-02 03:04:06.000000','2025-01-02 03:04:06.000000');
INSERT INTO "issues" VALUES('${legacyIssueId}','${legacyRoomId}','Persisted issue','','',1,NULL,NULL,'2025-01-02 03:04:05.000000');
INSERT INTO "votes" VALUES('55555555-5555-4555-8555-555555555555','${legacyRoomId}','${legacyIssueId}','${legacyMemberId}','13','2025-01-02 03:04:07.000000','2025-01-02 03:04:07.000000');
COMMIT;
`;

describe("Persisted database state", () => {
  it("serves rooms copied from the previous backend without changing credentials or shape", async () => {
    const fixture = await createFixture();
    try {
      fixture.seed(persistedSQL);

      const memberView = await fixture.request("GET", `/api/rooms/${legacyRoomCode}`, undefined, {
        "X-Participant-Token": legacyMemberToken,
      });
      expect(memberView.status).toBe(200);
      expect(memberView.body.room.id).toBe(legacyRoomId);
      expect(memberView.body.room.name).toBe("Cross-version");
      expect(memberView.body.room.host_token).toBe("");
      expect(memberView.body.issues).toHaveLength(1);
      expect(memberView.body.issues[0].title).toBe("Persisted issue");
      expect(memberView.body.participants).toHaveLength(2);
      const member = memberView.body.participants.find((participant: any) => participant.id === legacyMemberId);
      expect(member.token).toBe(legacyMemberToken);
      for (const participant of memberView.body.participants) {
        if (participant.id !== legacyMemberId) {
          expect(participant.token).toBe("");
        }
      }
      expect(memberView.body.votes).toHaveLength(1);
      expect(memberView.body.votes[0].value).toBe("13");

      const hostView = await fixture.request("GET", `/api/rooms/${legacyRoomCode}`, undefined, {
        "X-Host-Token": legacyHostToken,
      });
      expect(hostView.status).toBe(200);
      expect(hostView.body.room.host_token).toBe(legacyHostToken);
    } finally {
      await fixture.close();
    }
  });
});
