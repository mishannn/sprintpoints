import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { loadDatabaseConfig } from "../../src/config/database.config";
import { prepareDatabase } from "../../src/database/prepare-database";

const databaseUrl = process.env.TEST_POSTGRES_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

let schemaCounter = 0;

function uniqueSchema(prefix: string): string {
  schemaCounter += 1;
  return `${prefix}_${process.pid}_${Date.now()}_${schemaCounter}`.toLowerCase();
}

async function adminClient(): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

async function dropSchema(schema: string): Promise<void> {
  const admin = await adminClient();
  try {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await admin.end();
  }
}

async function createSchema(schema: string): Promise<void> {
  const admin = await adminClient();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await admin.end();
  }
}

type AppFixture = {
  app: INestApplication;
  request: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any; text: string }>;
};

async function startApp(schema: string): Promise<AppFixture> {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DATABASE_SCHEMA = schema;
  await prepareDatabase(loadDatabaseConfig());

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useLogger(false);
  configureApp(app, ["*"]);
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();

  const request = async (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const requestHeaders = { ...headers };
    const init: RequestInit = { method, headers: requestHeaders };
    if (body !== undefined) {
      requestHeaders["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${url}${path}`, init);
    const text = await response.text();
    let parsed: any;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: response.status, body: parsed, text };
  };

  return { app, request };
}

describePostgres("PostgreSQL backend", () => {
  it("migrates, serves the API, and serializes vote/spectator races with row locks", async () => {
    const schema = uniqueSchema("nest_api");
    let fixture: AppFixture | undefined;
    try {
      fixture = await startApp(schema);
      // A second startup sees the existing migration ledger and is a no-op.
      await prepareDatabase(loadDatabaseConfig());

      const created = await fixture.request("POST", "/api/rooms", {
        roomName: "Planning",
        participantName: "Host",
        defaults: { facilitatorName: "Facilitator", firstStoryTitle: "First story", roomName: "Default" },
      });
      expect(created.status).toBe(201);
      const room = created.body.state.room;
      const issue = created.body.state.issues[0];
      const participant = created.body.state.participants[0];
      const hostHeaders = { "X-Host-Token": created.body.hostToken };
      const participantHeaders = { "X-Participant-Token": created.body.participantToken };
      expect(typeof room.created_at).toBe("string");

      const votePath = `/api/rooms/${room.id}/issues/${issue.id}/votes/${participant.id}`;
      expect((await fixture.request("PUT", votePath, { value: "3" }, participantHeaders)).status).toBe(204);
      expect((await fixture.request("PUT", votePath, { value: "5" }, participantHeaders)).status).toBe(204);

      const joined = await fixture.request("POST", `/api/rooms/${room.code}/join`, {
        name: "Member",
        isSpectator: false,
      });
      const member = joined.body.participant;
      const memberToken = joined.body.participantToken;

      const [vote, spectator] = await Promise.all([
        fixture.request(
          "PUT",
          `/api/rooms/${room.id}/issues/${issue.id}/votes/${member.id}`,
          { value: "8" },
          { "X-Participant-Token": memberToken },
        ),
        fixture.request(
          "PATCH",
          `/api/participants/${member.id}`,
          { isSpectator: true },
          { "X-Participant-Token": memberToken },
        ),
      ]);
      expect([204, 403]).toContain(vote.status);
      expect([200, 403]).toContain(spectator.status);

      const loaded = await fixture.request("GET", `/api/rooms/${room.code}`, undefined, hostHeaders);
      expect(loaded.status).toBe(200);
      expect(loaded.body.votes.filter((vote: any) => vote.participant_id === member.id)).toHaveLength(0);

      const revealed = await fixture.request("PATCH", `/api/rooms/${room.id}/reveal`, undefined, hostHeaders);
      expect(revealed.status).toBe(204);
      const afterReveal = await fixture.request("GET", `/api/rooms/${room.code}`, undefined, hostHeaders);
      expect(afterReveal.body.room.revealed).toBe(true);
    } finally {
      if (fixture) {
        await fixture.app.close();
      }
      await dropSchema(schema);
    }
  });

  it("refuses an unmanaged PostgreSQL schema", async () => {
    const schema = uniqueSchema("nest_unmanaged");
    try {
      await createSchema(schema);
      const admin = await adminClient();
      try {
        await admin.query(`CREATE TABLE "${schema}".keep_me(id integer)`);
      } finally {
        await admin.end();
      }
      process.env.DATABASE_URL = databaseUrl;
      process.env.DATABASE_SCHEMA = schema;
      await expect(prepareDatabase(loadDatabaseConfig())).rejects.toThrow(/unmanaged/);
    } finally {
      await dropSchema(schema);
    }
  });

  it("copies Go data through the one-shot SQL import and refuses a second run", async () => {
    const source = uniqueSchema("nest_source");
    const target = uniqueSchema("nest_target");
    const migration = readFileSync(join(__dirname, "../../..", "ops/database/migrate-to-nestjs.sql"), "utf8");
    const doStatement = migration.slice(migration.indexOf("DO $import$"));
    const admin = await adminClient();
    let fixture: AppFixture | undefined;
    try {
      await admin.query(`CREATE SCHEMA "${source}"`);
      for (const statement of [
        `CREATE TABLE "${source}".rooms(id varchar(36) primary key, code varchar(16), name varchar(255), host_token varchar(255), owner_id varchar(36), card_set json, revealed boolean, active_issue_id varchar(36), created_at timestamptz, updated_at timestamp)`,
        `CREATE TABLE "${source}".participants(id varchar(36) primary key, room_id varchar(36), name varchar(255), token varchar(255), is_spectator boolean, last_seen_at timestamp, created_at timestamp)`,
        `CREATE TABLE "${source}".issues(id varchar(36) primary key, room_id varchar(36), title varchar(500), description text, link varchar(2048), position integer, estimate varchar(64), archived_at timestamp, created_at timestamp)`,
        `CREATE TABLE "${source}".votes(id varchar(36) primary key, room_id varchar(36), issue_id varchar(36), participant_id varchar(36), value varchar(64), created_at timestamp, updated_at timestamp)`,
        `CREATE TABLE "${source}".alembic_version(version_num varchar(32))`,
        `INSERT INTO "${source}".rooms VALUES ('r','ROOM','Planning','host-secret','p','["1","2","?"]',false,'i','2025-01-02 06:04:05.123456+03','2025-01-02 03:04:05')`,
        `INSERT INTO "${source}".participants VALUES ('p','r','Owner','member-secret',false,'2025-01-02 03:04:05','2025-01-02 03:04:05')`,
        `INSERT INTO "${source}".issues VALUES ('i','r','Issue','','',0,'2',NULL,'2025-01-02 03:04:05')`,
        `INSERT INTO "${source}".votes VALUES ('v','r','i','p','2','2025-01-02 03:04:05','2025-01-02 03:04:05')`,
        `INSERT INTO "${source}".alembic_version VALUES ('old')`,
      ]) {
        await admin.query(statement);
      }

      process.env.DATABASE_URL = databaseUrl;
      process.env.DATABASE_SCHEMA = target;
      await prepareDatabase(loadDatabaseConfig());

      await admin.query("SELECT set_config('sprintpoints.transfer_source', $1, false)", [source]);
      await admin.query("SELECT set_config('sprintpoints.transfer_target', $1, false)", [target]);
      await admin.query(doStatement);

      const room = await admin.query(`SELECT * FROM "${target}".rooms`);
      expect(room.rows).toHaveLength(1);
      expect(room.rows[0]).toMatchObject({
        id: "r",
        code: "ROOM",
        host_token: "host-secret",
        owner_id: "p",
        active_issue_id: "i",
      });
      expect(JSON.parse(room.rows[0].card_set)).toEqual(["1", "2", "?"]);
      expect(room.rows[0].created_at.toISOString()).toBe("2025-01-02T03:04:05.123Z");

      const counts = await admin.query(
        `SELECT (SELECT count(*) FROM "${target}".participants)::int AS participants,
                (SELECT count(*) FROM "${target}".issues)::int AS issues,
                (SELECT count(*) FROM "${target}".votes)::int AS votes`,
      );
      expect(counts.rows[0]).toEqual({ participants: 1, issues: 1, votes: 1 });

      await expect(admin.query(doStatement)).rejects.toThrow(/must be empty/);

      const sourceCounts = await admin.query(
        `SELECT (SELECT count(*) FROM "${source}".rooms)::int AS rooms,
                (SELECT count(*) FROM "${source}".participants)::int AS participants,
                (SELECT count(*) FROM "${source}".issues)::int AS issues,
                (SELECT count(*) FROM "${source}".votes)::int AS votes,
                (SELECT count(*) FROM "${source}".alembic_version)::int AS alembic`,
      );
      expect(sourceCounts.rows[0]).toEqual({ rooms: 1, participants: 1, issues: 1, votes: 1, alembic: 1 });

      fixture = await startApp(target);
      const loaded = await fixture.request("GET", "/api/rooms/ROOM", undefined, {
        "X-Host-Token": "host-secret",
      });
      expect(loaded.status).toBe(200);
      expect(loaded.body.room.card_set).toEqual(["1", "2", "?"]);
      expect(loaded.body.room.host_token).toBe("host-secret");
      expect(loaded.body.votes).toHaveLength(1);
      expect(loaded.body.votes[0].value).toBe("2");
    } finally {
      if (fixture) {
        await fixture.app.close();
      }
      await admin.end();
      await dropSchema(source);
      await dropSchema(target);
    }
  });

  it("refuses invalid or cross-room source data atomically", async () => {
    const source = uniqueSchema("nest_badsource");
    const target = uniqueSchema("nest_badtarget");
    const migration = readFileSync(join(__dirname, "../../..", "ops/database/migrate-to-nestjs.sql"), "utf8");
    const doStatement = migration.slice(migration.indexOf("DO $import$"));
    const admin = await adminClient();
    try {
      await admin.query(`CREATE SCHEMA "${source}"`);
      for (const statement of [
        `CREATE TABLE "${source}".rooms(id varchar(36) primary key, code varchar(16), name varchar(255), host_token varchar(255), owner_id varchar(36), card_set json, revealed boolean, active_issue_id varchar(36), created_at timestamp, updated_at timestamp)`,
        `CREATE TABLE "${source}".participants(id varchar(36) primary key, room_id varchar(36), name varchar(255), token varchar(255), is_spectator boolean, last_seen_at timestamp, created_at timestamp)`,
        `CREATE TABLE "${source}".issues(id varchar(36) primary key, room_id varchar(36), title varchar(500), description text, link varchar(2048), position integer, estimate varchar(64), archived_at timestamp, created_at timestamp)`,
        `CREATE TABLE "${source}".votes(id varchar(36) primary key, room_id varchar(36), issue_id varchar(36), participant_id varchar(36), value varchar(64), created_at timestamp, updated_at timestamp)`,
        `INSERT INTO "${source}".rooms VALUES ('r','ROOM','Planning','host-secret','p','[]',false,'i','2025-01-02 03:04:05','2025-01-02 03:04:05')`,
        `INSERT INTO "${source}".participants VALUES ('p','r','Owner','member-secret',false,'2025-01-02 03:04:05','2025-01-02 03:04:05')`,
        `INSERT INTO "${source}".issues VALUES ('i','r','Issue','','',0,NULL,NULL,'2025-01-02 03:04:05')`,
        `INSERT INTO "${source}".votes VALUES ('v','missing','i','p','2','2025-01-02 03:04:05','2025-01-02 03:04:05')`,
      ]) {
        await admin.query(statement);
      }

      process.env.DATABASE_URL = databaseUrl;
      process.env.DATABASE_SCHEMA = target;
      await prepareDatabase(loadDatabaseConfig());
      await admin.query("SELECT set_config('sprintpoints.transfer_source', $1, false)", [source]);
      await admin.query("SELECT set_config('sprintpoints.transfer_target', $1, false)", [target]);

      await expect(admin.query(doStatement)).rejects.toThrow(/cross-room reference/);
      const counts = await admin.query(
        `SELECT (SELECT count(*) FROM "${target}".rooms)::int AS rooms,
                (SELECT count(*) FROM "${target}".participants)::int AS participants,
                (SELECT count(*) FROM "${target}".issues)::int AS issues,
                (SELECT count(*) FROM "${target}".votes)::int AS votes`,
      );
      expect(counts.rows[0]).toEqual({ rooms: 0, participants: 0, issues: 0, votes: 0 });
    } finally {
      await admin.end();
      await dropSchema(source);
      await dropSchema(target);
    }
  });
});
