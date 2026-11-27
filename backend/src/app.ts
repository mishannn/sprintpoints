import {
  ADMIN_TOKEN_HEADER,
  activeIssueSchema,
  createRoomSchema,
  DEFAULT_CARD_SET,
  estimateSchema,
  HOST_TOKEN_HEADER,
  importIssuesSchema,
  issueDetailsSchema,
  joinRoomSchema,
  nextActiveIssueSchema,
  normalizeRoomCode,
  PARTICIPANT_TOKEN_HEADER,
  transferOwnershipSchema,
  updateParticipantSchema,
  voteSchema,
} from "@sprintpoints/shared";
import { and, asc, eq, isNotNull, isNull, max, ne } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { Hono, type Context } from "hono";
import { describeRoute, resolver, validator as zValidator } from "hono-openapi";
import { HTTPException } from "hono/http-exception";
import { z, type ZodType } from "zod";
import type { Env } from "./env";
import {
  allocateCode,
  ApiError,
  fmt,
  forbidden,
  formatIssues,
  newId,
  newToken,
  notFound,
  now,
  parseCardSet,
  tokenEq,
} from "./lib";
import {
  adminExportSchema,
  adminImportResultSchema,
  adminImportSchema,
  createRoomResponseSchema,
  emptyResponse,
  errorResponse,
  healthSchema,
  issueSchema,
  joinRoomResponseSchema,
  jsonResponse,
  participantSchema,
  roomStateSchema,
  security,
} from "./openapi";
import * as s from "./schema";

type Db = DrizzleSqliteDODatabase<typeof s>;
type Ctx = Context<{ Bindings: Env }>;
type RoomPatch = Partial<typeof s.rooms.$inferInsert>;
type IssuePatch = Partial<typeof s.issues.$inferInsert>;
type ParticipantPatch = Partial<typeof s.participants.$inferInsert>;
type Json = { detail: string };

const host = (c: Ctx) => c.req.header(HOST_TOKEN_HEADER) ?? null;
const member = (c: Ctx) => c.req.header(PARTICIPANT_TOKEN_HEADER) ?? null;
const json = <T extends ZodType>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) return c.json<Json>({ detail: formatIssues(result.error) }, 422);
  });

export function createApp(db: Db, notify: (roomId: string) => void) {
  const app = new Hono<{ Bindings: Env }>();

  const roomById = (id: string) => db.select().from(s.rooms).where(eq(s.rooms.id, id)).get();
  const roomByCode = (code: string) =>
    db
      .select()
      .from(s.rooms)
      .where(eq(s.rooms.code, normalizeRoomCode(code)))
      .get();
  const participantById = (id: string) =>
    db.select().from(s.participants).where(eq(s.participants.id, id)).get();
  const issueById = (id: string) => db.select().from(s.issues).where(eq(s.issues.id, id)).get();

  const setRoom = (id: string, values: RoomPatch) =>
    db.update(s.rooms).set(values).where(eq(s.rooms.id, id)).run();
  const setIssue = (id: string, values: IssuePatch) =>
    db.update(s.issues).set(values).where(eq(s.issues.id, id)).run();
  const setParticipant = (id: string, values: ParticipantPatch) =>
    db.update(s.participants).set(values).where(eq(s.participants.id, id)).run();

  const issueOr404 = (id: string) => {
    const issue = issueById(id);
    if (!issue) throw notFound("storyNotFound");
    return issue;
  };
  const roomIssue = (c: Ctx, room: s.Room) => {
    const issue = issueOr404(c.req.param("issue")!);
    if (issue.room_id !== room.id) throw notFound("storyNotFound");
    return issue;
  };
  const authHost = (c: Ctx) => requireHost(c.req.param("room")!, host(c));
  const authParticipant = (c: Ctx) => requireParticipant(c.req.param("participant")!, member(c));

  function requireHost(roomId: string, token: string | null): s.Room {
    const room = roomById(roomId);
    if (!room) throw notFound("roomNotFound");
    if (!tokenEq(token, room.host_token)) throw forbidden("hostAccessDenied");
    return room;
  }

  function requireParticipant(participantId: string, token: string | null): s.Participant {
    const participant = participantById(participantId);
    if (!participant) throw notFound("participantNotFound");
    if (!tokenEq(token, participant.token)) throw forbidden("participantAccessDenied");
    return participant;
  }

  function requireMember(room: s.Room, participantToken: string | null, hostToken: string | null) {
    if (tokenEq(hostToken, room.host_token)) return;
    const known = participantToken
      ? db
          .select({ id: s.participants.id })
          .from(s.participants)
          .where(
            and(eq(s.participants.room_id, room.id), eq(s.participants.token, participantToken)),
          )
          .get()
      : null;
    if (!known) throw forbidden("roomAccessDenied");
  }

  function requireAdmin(c: Ctx) {
    const expected = c.env.ADMIN_TOKEN;
    if (!expected) throw notFound("Not Found");
    if (!tokenEq(c.req.header(ADMIN_TOKEN_HEADER), expected)) throw forbidden("adminAccessDenied");
  }

  const roomView = (room: s.Room, revealHostToken: boolean) => ({
    ...room,
    host_token: revealHostToken ? room.host_token : "",
    card_set: parseCardSet(room.card_set),
    revealed: Boolean(room.revealed),
    created_at: fmt(room.created_at) || "",
    updated_at: fmt(room.updated_at) || "",
  });

  const participantView = (participant: s.Participant, requestToken: string | null) => ({
    ...participant,
    token: tokenEq(requestToken, participant.token) ? participant.token : "",
    is_spectator: Boolean(participant.is_spectator),
    last_seen_at: fmt(participant.last_seen_at) || "",
    created_at: fmt(participant.created_at) || "",
  });

  const issueView = (issue: s.Issue) => ({
    ...issue,
    description: issue.description || "",
    link: issue.link || "",
    position: Number(issue.position),
    archived_at: fmt(issue.archived_at),
    created_at: fmt(issue.created_at) || "",
  });

  const voteView = (vote: s.Vote) => ({
    ...vote,
    created_at: fmt(vote.created_at) || "",
    updated_at: fmt(vote.updated_at) || "",
  });

  function roomState(room: s.Room, participantToken: string | null, hostToken: string | null) {
    const participants = db
      .select()
      .from(s.participants)
      .where(eq(s.participants.room_id, room.id))
      .orderBy(asc(s.participants.created_at), asc(s.participants.id))
      .all();
    const issues = db
      .select()
      .from(s.issues)
      .where(eq(s.issues.room_id, room.id))
      .orderBy(asc(s.issues.position), asc(s.issues.created_at), asc(s.issues.id))
      .all();
    const votes = db.select().from(s.votes).where(eq(s.votes.room_id, room.id)).all();
    const revealHost =
      tokenEq(hostToken, room.host_token) ||
      (!!room.owner_id &&
        participants.some(
          (participant) =>
            participant.id === room.owner_id && tokenEq(participantToken, participant.token),
        ));
    return {
      room: roomView(room, revealHost),
      participants: participants.map((participant) =>
        participantView(participant, participantToken),
      ),
      issues: issues.map(issueView),
      votes: votes.map(voteView),
    };
  }

  function nextPosition(roomId: string) {
    const current = db
      .select({ value: max(s.issues.position) })
      .from(s.issues)
      .where(eq(s.issues.room_id, roomId))
      .get()?.value;
    return (current ?? 0) + 1;
  }

  // Trailing slashes redirect; CORS handles preflight before routing.
  app.use("*", async (c, next) => {
    const path = c.req.path;
    if (path.length > 1 && path.endsWith("/")) {
      const url = new URL(c.req.url);
      url.pathname = path.replace(/\/+$/, "");
      return c.redirect(
        url.toString(),
        c.req.method === "GET" || c.req.method === "HEAD" ? 301 : 307,
      );
    }
    await next();
  });

  app.use("*", async (c, next) => {
    const origin = c.req.header("Origin");
    if (!origin) return next();
    const origins = (c.env.CORS_ORIGINS ?? "*")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const allowAny = origins.includes("*");
    const allowed = allowAny || origins.includes(origin);
    if (c.req.method === "OPTIONS") {
      if (!allowed) return c.body(null, 403);
      return c.body(null, 204, {
        vary: "Origin",
        "access-control-allow-origin": allowAny ? "*" : origin,
        "access-control-allow-methods": "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS",
        "access-control-allow-headers": `${HOST_TOKEN_HEADER},${PARTICIPANT_TOKEN_HEADER},Origin,Content-Type`,
        "access-control-max-age": "600",
      });
    }
    await next();
    if (allowed) {
      c.header("vary", "Origin");
      c.header("access-control-allow-origin", allowAny ? "*" : origin);
    }
  });

  // Hono has no automatic 405, so turn a 404 on a known path into one.
  const knownRoutes: [RegExp, string[]][] = [
    [/^\/api\/health$/, ["GET"]],
    [/^\/api\/rooms$/, ["POST"]],
    [/^\/api\/rooms\/[^/]+\/join$/, ["POST"]],
    [/^\/api\/rooms\/[^/]+$/, ["GET"]],
    [/^\/api\/rooms\/[^/]+\/transfer-ownership$/, ["POST"]],
    [/^\/api\/participants\/[^/]+\/heartbeat$/, ["POST"]],
    [/^\/api\/participants\/[^/]+$/, ["PATCH"]],
    [/^\/api\/rooms\/[^/]+\/participants\/[^/]+$/, ["DELETE"]],
    [/^\/api\/rooms\/[^/]+\/issues$/, ["POST"]],
    [/^\/api\/rooms\/[^/]+\/issues\/import$/, ["POST"]],
    [/^\/api\/issues\/[^/]+$/, ["PATCH"]],
    [/^\/api\/rooms\/[^/]+\/issues\/[^/]+$/, ["DELETE"]],
    [/^\/api\/rooms\/[^/]+\/issues\/[^/]+\/archive$/, ["PATCH"]],
    [/^\/api\/rooms\/[^/]+\/issues\/archive-estimated$/, ["POST"]],
    [/^\/api\/rooms\/[^/]+\/issues\/[^/]+\/unarchive$/, ["PATCH"]],
    [/^\/api\/rooms\/[^/]+\/active-issue$/, ["PATCH"]],
    [/^\/api\/issues\/[^/]+\/estimate$/, ["PATCH"]],
    [/^\/api\/rooms\/[^/]+\/issues\/[^/]+\/votes\/[^/]+$/, ["PUT"]],
    [/^\/api\/rooms\/[^/]+\/reveal$/, ["PATCH"]],
    [/^\/api\/rooms\/[^/]+\/issues\/[^/]+\/reset-votes$/, ["POST"]],
    [/^\/api\/issues\/[^/]+\/votes\/[^/]+$/, ["DELETE"]],
    [/^\/api\/admin\/export$/, ["GET"]],
    [/^\/api\/admin\/import$/, ["POST"]],
  ];

  app.use("*", async (c, next) => {
    await next();
    if (c.res.status !== 404) return;
    const method = c.req.method;
    const mismatch = knownRoutes.some(
      ([pattern, methods]) =>
        pattern.test(c.req.path) &&
        !methods.includes(method) &&
        !(method === "HEAD" && methods.includes("GET")),
    );
    if (mismatch) c.res = c.json<Json>({ detail: "Method Not Allowed" }, 405);
  });

  app.get(
    "/api/health",
    describeRoute({
      operationId: "getHealth",
      tags: ["Health"],
      summary: "Health check",
      responses: { 200: jsonResponse(healthSchema, "Service is healthy") },
    }),
    (c) => c.json({ status: "ok" }),
  );

  app.post(
    "/api/rooms",
    describeRoute({
      operationId: "createRoom",
      tags: ["Rooms"],
      summary: "Create a planning room",
      responses: {
        201: jsonResponse(createRoomResponseSchema, "Room created"),
        422: errorResponse("Validation error"),
      },
    }),
    json(createRoomSchema),
    (c) => {
      const body = c.req.valid("json");
      const timestamp = now();
      const code = allocateCode((candidate) => !!roomByCode(candidate));
      const roomId = newId();
      const participantId = newId();
      const issueId = newId();
      const hostToken = newToken();
      const participantToken = newToken();
      const room: s.Room = {
        id: roomId,
        code,
        name: body.roomName.trim() || body.defaults.roomName,
        host_token: hostToken,
        owner_id: participantId,
        card_set: JSON.stringify(DEFAULT_CARD_SET),
        revealed: 0,
        active_issue_id: issueId,
        created_at: timestamp,
        updated_at: timestamp,
      };
      const participant: s.Participant = {
        id: participantId,
        room_id: roomId,
        name: body.participantName.trim() || body.defaults.facilitatorName,
        token: participantToken,
        is_spectator: 0,
        last_seen_at: timestamp,
        created_at: timestamp,
      };
      const issue: s.Issue = {
        id: issueId,
        room_id: roomId,
        title: body.defaults.firstStoryTitle,
        description: "",
        link: "",
        position: 1,
        estimate: null,
        archived_at: null,
        created_at: timestamp,
      };
      db.transaction((tx) => {
        tx.insert(s.rooms).values(room).run();
        tx.insert(s.participants).values(participant).run();
        tx.insert(s.issues).values(issue).run();
      });
      return c.json(
        {
          hostToken,
          participantToken,
          state: roomState(room, participantToken, hostToken),
          participant: participantView(participant, participantToken),
        },
        201,
      );
    },
  );

  app.post(
    "/api/rooms/:room/join",
    describeRoute({
      operationId: "joinRoom",
      tags: ["Rooms"],
      summary: "Join a room by code",
      responses: {
        201: jsonResponse(joinRoomResponseSchema, "Joined"),
        400: errorResponse("Room code or name is missing"),
        404: errorResponse("Room not found"),
        422: errorResponse("Validation error"),
      },
    }),
    json(joinRoomSchema),
    (c) => {
      const body = c.req.valid("json");
      const code = normalizeRoomCode(c.req.param("room")!);
      const name = body.name.trim();
      if (!code || !name) throw new ApiError(400, "joinRoomRequired");
      const room = roomByCode(code);
      if (!room) throw notFound("roomNotFound");
      const timestamp = now();
      const participant: s.Participant = {
        id: newId(),
        room_id: room.id,
        name,
        token: newToken(),
        is_spectator: body.isSpectator ? 1 : 0,
        last_seen_at: timestamp,
        created_at: timestamp,
      };
      db.insert(s.participants).values(participant).run();
      notify(room.id);
      return c.json(
        {
          room: roomView(room, false),
          participant: participantView(participant, participant.token),
          participantToken: participant.token,
        },
        201,
      );
    },
  );

  app.get(
    "/api/rooms/:room",
    describeRoute({
      operationId: "getRoom",
      tags: ["Rooms"],
      summary: "Load room state",
      security: security.member,
      responses: {
        200: jsonResponse(roomStateSchema, "Room state"),
        403: errorResponse("Room access denied"),
        404: errorResponse("Room not found"),
      },
    }),
    (c) => {
      const room = roomByCode(c.req.param("room")!);
      if (!room) throw notFound("roomNotFound");
      const participantToken = member(c);
      const hostToken = host(c);
      requireMember(room, participantToken, hostToken);
      return c.json(roomState(room, participantToken, hostToken));
    },
  );

  app.post(
    "/api/rooms/:room/transfer-ownership",
    describeRoute({
      operationId: "transferOwnership",
      tags: ["Rooms"],
      summary: "Transfer host ownership",
      security: security.host,
      responses: {
        204: emptyResponse("Ownership transferred"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Room or participant not found"),
        422: errorResponse("Validation error"),
      },
    }),
    json(transferOwnershipSchema),
    (c) => {
      const body = c.req.valid("json");
      const room = authHost(c);
      const participant = participantById(body.participantId);
      if (!participant || participant.room_id !== room.id) throw notFound("participantNotFound");
      setRoom(room.id, { host_token: newToken(), owner_id: participant.id, updated_at: now() });
      notify(room.id);
      return c.body(null, 204);
    },
  );

  app.patch(
    "/api/rooms/:room/active-issue",
    describeRoute({
      operationId: "setActiveIssue",
      tags: ["Issues"],
      summary: "Select the active story",
      security: security.host,
      responses: {
        204: emptyResponse("Active story changed"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Room or story not found"),
        422: errorResponse("Validation error"),
      },
    }),
    json(activeIssueSchema),
    (c) => {
      const body = c.req.valid("json");
      const room = authHost(c);
      if (body.issueId !== null) {
        const issue = issueById(body.issueId);
        if (!issue || issue.room_id !== room.id) throw notFound("storyNotFound");
      }
      setRoom(room.id, { active_issue_id: body.issueId, revealed: 0, updated_at: now() });
      notify(room.id);
      return c.body(null, 204);
    },
  );

  app.patch(
    "/api/rooms/:room/reveal",
    describeRoute({
      operationId: "revealVotes",
      tags: ["Votes"],
      summary: "Reveal votes",
      security: security.host,
      responses: {
        204: emptyResponse("Votes revealed"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Room not found"),
      },
    }),
    (c) => {
      const room = authHost(c);
      setRoom(room.id, { revealed: 1, updated_at: now() });
      notify(room.id);
      return c.body(null, 204);
    },
  );

  app.post(
    "/api/participants/:participant/heartbeat",
    describeRoute({
      operationId: "heartbeat",
      tags: ["Participants"],
      summary: "Refresh participant presence",
      security: security.participant,
      responses: {
        204: emptyResponse("Heartbeat recorded"),
        403: errorResponse("Participant access denied"),
        404: errorResponse("Participant not found"),
      },
    }),
    (c) => {
      const participant = authParticipant(c);
      setParticipant(participant.id, { last_seen_at: now() });
      return c.body(null, 204);
    },
  );

  app.patch(
    "/api/participants/:participant",
    describeRoute({
      operationId: "updateParticipant",
      tags: ["Participants"],
      summary: "Change spectator mode",
      security: security.participant,
      responses: {
        200: jsonResponse(participantSchema, "Updated participant"),
        403: errorResponse("Participant access denied"),
        404: errorResponse("Participant not found"),
        422: errorResponse("Validation error"),
      },
    }),
    json(updateParticipantSchema),
    (c) => {
      const body = c.req.valid("json");
      const token = member(c);
      const participant = requireParticipant(c.req.param("participant")!, token);
      const spectator = body.isSpectator ? 1 : 0;
      db.transaction((tx) => {
        tx.update(s.participants)
          .set({ is_spectator: spectator })
          .where(eq(s.participants.id, participant.id))
          .run();
        if (spectator) {
          const room = tx.select().from(s.rooms).where(eq(s.rooms.id, participant.room_id)).get();
          if (room?.active_issue_id) {
            tx.delete(s.votes)
              .where(
                and(
                  eq(s.votes.issue_id, room.active_issue_id),
                  eq(s.votes.participant_id, participant.id),
                ),
              )
              .run();
          }
        }
      });
      notify(participant.room_id);
      return c.json(participantView({ ...participant, is_spectator: spectator }, token));
    },
  );

  app.delete(
    "/api/rooms/:room/participants/:participant",
    describeRoute({
      operationId: "removeParticipant",
      tags: ["Participants"],
      summary: "Remove a participant",
      security: security.host,
      responses: {
        204: emptyResponse("Participant removed"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Room or participant not found"),
      },
    }),
    (c) => {
      const room = authHost(c);
      const participant = participantById(c.req.param("participant")!);
      if (!participant || participant.room_id !== room.id) throw notFound("participantNotFound");
      db.transaction((tx) => {
        tx.delete(s.participants).where(eq(s.participants.id, participant.id)).run();
        tx.delete(s.votes).where(eq(s.votes.participant_id, participant.id)).run();
      });
      notify(room.id);
      return c.body(null, 204);
    },
  );

  app.post(
    "/api/rooms/:room/issues",
    describeRoute({
      operationId: "createIssue",
      tags: ["Issues"],
      summary: "Add a story",
      security: security.host,
      responses: {
        201: jsonResponse(issueSchema.nullable(), "Created story, or null for a blank title"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Room not found"),
        422: errorResponse("Validation error"),
      },
    }),
    json(issueDetailsSchema),
    (c) => {
      const body = c.req.valid("json");
      const room = authHost(c);
      const title = body.title.trim();
      if (!title) return c.json(null, 201);
      const timestamp = now();
      const issue: s.Issue = {
        id: newId(),
        room_id: room.id,
        title,
        description: (body.description ?? "").trim(),
        link: (body.link ?? "").trim(),
        position: nextPosition(room.id),
        estimate: null,
        archived_at: null,
        created_at: timestamp,
      };
      db.transaction((tx) => {
        tx.insert(s.issues).values(issue).run();
        tx.update(s.rooms)
          .set({ active_issue_id: issue.id, revealed: 0, updated_at: timestamp })
          .where(eq(s.rooms.id, room.id))
          .run();
      });
      notify(room.id);
      return c.json(issueView(issue), 201);
    },
  );

  app.post(
    "/api/rooms/:room/issues/import",
    describeRoute({
      operationId: "importIssues",
      tags: ["Issues"],
      summary: "Import a story batch",
      security: security.host,
      responses: {
        201: jsonResponse(z.array(issueSchema), "Imported stories"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Room not found"),
        422: errorResponse("Validation error"),
      },
    }),
    json(importIssuesSchema),
    (c) => {
      const body = c.req.valid("json");
      const room = authHost(c);
      const start = nextPosition(room.id);
      const timestamp = now();
      const imported: s.Issue[] = [];
      body.issues.forEach((item, offset) => {
        const title = item.title.trim();
        if (!title) return;
        imported.push({
          id: newId(),
          room_id: room.id,
          title,
          description: (item.description ?? "").trim(),
          link: (item.link ?? "").trim(),
          position: start + offset,
          estimate: (item.estimate ?? "").trim() || null,
          archived_at: null,
          created_at: timestamp,
        });
      });
      db.transaction((tx) => {
        for (const issue of imported) tx.insert(s.issues).values(issue).run();
        if (imported.length > 0 && room.active_issue_id === null) {
          tx.update(s.rooms)
            .set({ active_issue_id: imported[0].id, revealed: 0, updated_at: timestamp })
            .where(eq(s.rooms.id, room.id))
            .run();
        }
      });
      if (imported.length > 0) notify(room.id);
      return c.json(imported.map(issueView), 201);
    },
  );

  app.patch(
    "/api/issues/:issue",
    describeRoute({
      operationId: "updateIssue",
      tags: ["Issues"],
      summary: "Edit a story",
      security: security.host,
      responses: {
        200: jsonResponse(issueSchema, "Updated story"),
        400: errorResponse("Story title is required"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Story or room not found"),
        422: errorResponse("Validation error"),
      },
    }),
    json(issueDetailsSchema),
    (c) => {
      const body = c.req.valid("json");
      const issue = issueOr404(c.req.param("issue")!);
      requireHost(issue.room_id, host(c));
      const title = body.title.trim();
      if (!title) throw new ApiError(400, "storyTitleRequired");
      const updated: s.Issue = {
        ...issue,
        title,
        description: (body.description ?? "").trim(),
        link: (body.link ?? "").trim(),
      };
      setIssue(issue.id, {
        title: updated.title,
        description: updated.description,
        link: updated.link,
      });
      notify(issue.room_id);
      return c.json(issueView(updated));
    },
  );

  app.delete(
    "/api/rooms/:room/issues/:issue",
    describeRoute({
      operationId: "deleteIssue",
      tags: ["Issues"],
      summary: "Delete a story",
      security: security.host,
      parameters: [
        {
          in: "query",
          name: "next_active_issue_id",
          required: false,
          schema: { type: "string" },
        },
      ],
      responses: {
        204: emptyResponse("Story deleted"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Story or room not found"),
      },
    }),
    (c) => {
      const room = authHost(c);
      const issue = roomIssue(c, room);
      const search = new URL(c.req.url).searchParams;
      const timestamp = now();
      db.transaction((tx) => {
        tx.delete(s.issues).where(eq(s.issues.id, issue.id)).run();
        tx.delete(s.votes).where(eq(s.votes.issue_id, issue.id)).run();
        if (room.active_issue_id === issue.id || search.has("next_active_issue_id")) {
          tx.update(s.rooms)
            .set({
              active_issue_id: search.get("next_active_issue_id") || null,
              revealed: 0,
              updated_at: timestamp,
            })
            .where(eq(s.rooms.id, room.id))
            .run();
        }
      });
      notify(room.id);
      return c.body(null, 204);
    },
  );

  app.patch(
    "/api/rooms/:room/issues/:issue/archive",
    describeRoute({
      operationId: "archiveIssue",
      tags: ["Issues"],
      summary: "Archive a story",
      security: security.host,
      responses: {
        200: jsonResponse(issueSchema, "Archived story"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Story or room not found"),
        422: errorResponse("Validation error"),
      },
    }),
    json(nextActiveIssueSchema),
    (c) => {
      const body = c.req.valid("json");
      const room = authHost(c);
      const issue = roomIssue(c, room);
      const timestamp = now();
      db.transaction((tx) => {
        tx.update(s.issues).set({ archived_at: timestamp }).where(eq(s.issues.id, issue.id)).run();
        if (room.active_issue_id === issue.id) {
          tx.update(s.rooms)
            .set({ active_issue_id: body.nextActiveIssueId, revealed: 0, updated_at: timestamp })
            .where(eq(s.rooms.id, room.id))
            .run();
        }
      });
      notify(room.id);
      return c.json(issueView({ ...issue, archived_at: timestamp }));
    },
  );

  app.post(
    "/api/rooms/:room/issues/archive-estimated",
    describeRoute({
      operationId: "archiveEstimatedIssues",
      tags: ["Issues"],
      summary: "Archive all estimated stories",
      security: security.host,
      responses: {
        200: jsonResponse(z.array(issueSchema), "Archived stories"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Room not found"),
        422: errorResponse("Validation error"),
      },
    }),
    json(nextActiveIssueSchema),
    (c) => {
      const body = c.req.valid("json");
      const room = authHost(c);
      const estimated = db
        .select()
        .from(s.issues)
        .where(
          and(
            eq(s.issues.room_id, room.id),
            isNull(s.issues.archived_at),
            isNotNull(s.issues.estimate),
            ne(s.issues.estimate, ""),
          ),
        )
        .orderBy(asc(s.issues.position), asc(s.issues.id))
        .all();
      const timestamp = now();
      db.transaction((tx) => {
        for (const issue of estimated) {
          tx.update(s.issues)
            .set({ archived_at: timestamp })
            .where(eq(s.issues.id, issue.id))
            .run();
          if (room.active_issue_id === issue.id) {
            tx.update(s.rooms)
              .set({ active_issue_id: body.nextActiveIssueId, revealed: 0, updated_at: timestamp })
              .where(eq(s.rooms.id, room.id))
              .run();
          }
        }
      });
      if (estimated.length > 0) notify(room.id);
      return c.json(estimated.map((issue) => issueView({ ...issue, archived_at: timestamp })));
    },
  );

  app.patch(
    "/api/rooms/:room/issues/:issue/unarchive",
    describeRoute({
      operationId: "unarchiveIssue",
      tags: ["Issues"],
      summary: "Restore an archived story",
      security: security.host,
      responses: {
        200: jsonResponse(issueSchema, "Restored story"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Story or room not found"),
      },
    }),
    (c) => {
      const room = authHost(c);
      const issue = roomIssue(c, room);
      setIssue(issue.id, { archived_at: null });
      notify(room.id);
      return c.json(issueView({ ...issue, archived_at: null }));
    },
  );

  app.patch(
    "/api/issues/:issue/estimate",
    describeRoute({
      operationId: "setEstimate",
      tags: ["Issues"],
      summary: "Save a story estimate",
      security: security.host,
      responses: {
        204: emptyResponse("Estimate saved"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Story or room not found"),
        422: errorResponse("Validation error"),
      },
    }),
    json(estimateSchema),
    (c) => {
      const body = c.req.valid("json");
      const issue = issueOr404(c.req.param("issue")!);
      requireHost(issue.room_id, host(c));
      setIssue(issue.id, { estimate: body.value });
      notify(issue.room_id);
      return c.body(null, 204);
    },
  );

  app.put(
    "/api/rooms/:room/issues/:issue/votes/:participant",
    describeRoute({
      operationId: "castVote",
      tags: ["Votes"],
      summary: "Cast or change a vote",
      security: security.participant,
      responses: {
        204: emptyResponse("Vote saved"),
        403: errorResponse("Participant access denied"),
        404: errorResponse("Room, story or participant not found"),
        422: errorResponse("Validation error"),
      },
    }),
    json(voteSchema),
    (c) => {
      const body = c.req.valid("json");
      const roomId = c.req.param("room")!;
      const participant = authParticipant(c);
      const issue = issueById(c.req.param("issue")!);
      if (participant.room_id !== roomId || !issue || issue.room_id !== roomId) {
        throw notFound("roomNotFound");
      }
      if (participant.is_spectator) throw forbidden("spectatorsCannotVote");
      const timestamp = now();
      db.insert(s.votes)
        .values({
          id: newId(),
          room_id: participant.room_id,
          issue_id: issue.id,
          participant_id: participant.id,
          value: body.value,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .onConflictDoUpdate({
          target: [s.votes.issue_id, s.votes.participant_id],
          set: { value: body.value, updated_at: timestamp },
        })
        .run();
      notify(participant.room_id);
      return c.body(null, 204);
    },
  );

  app.post(
    "/api/rooms/:room/issues/:issue/reset-votes",
    describeRoute({
      operationId: "resetVotes",
      tags: ["Votes"],
      summary: "Clear votes for a story",
      security: security.host,
      responses: {
        204: emptyResponse("Votes cleared"),
        403: errorResponse("Host access denied"),
        404: errorResponse("Story or room not found"),
      },
    }),
    (c) => {
      const room = authHost(c);
      const issue = roomIssue(c, room);
      db.transaction((tx) => {
        tx.delete(s.votes).where(eq(s.votes.issue_id, issue.id)).run();
        tx.update(s.rooms)
          .set({ revealed: 0, updated_at: now() })
          .where(eq(s.rooms.id, room.id))
          .run();
      });
      notify(room.id);
      return c.body(null, 204);
    },
  );

  app.delete(
    "/api/issues/:issue/votes/:participant",
    describeRoute({
      operationId: "deleteVote",
      tags: ["Votes"],
      summary: "Withdraw a vote",
      security: security.participant,
      responses: {
        204: emptyResponse("Vote removed"),
        403: errorResponse("Participant access denied"),
        404: errorResponse("Story or participant not found"),
      },
    }),
    (c) => {
      const participant = authParticipant(c);
      const issue = issueById(c.req.param("issue")!);
      if (!issue || issue.room_id !== participant.room_id) throw notFound("roomNotFound");
      db.delete(s.votes)
        .where(and(eq(s.votes.issue_id, issue.id), eq(s.votes.participant_id, participant.id)))
        .run();
      notify(participant.room_id);
      return c.body(null, 204);
    },
  );

  app.get(
    "/api/admin/export",
    describeRoute({
      operationId: "adminExport",
      tags: ["Admin"],
      summary: "Export all data",
      security: security.admin,
      responses: {
        200: jsonResponse(adminExportSchema, "Full data dump"),
        403: errorResponse("Admin access denied"),
        404: errorResponse("Admin API disabled"),
      },
    }),
    (c) => {
      requireAdmin(c);
      return c.json({
        rooms: db.select().from(s.rooms).orderBy(asc(s.rooms.created_at)).all(),
        participants: db
          .select()
          .from(s.participants)
          .orderBy(asc(s.participants.created_at))
          .all(),
        issues: db.select().from(s.issues).orderBy(asc(s.issues.position)).all(),
        votes: db.select().from(s.votes).orderBy(asc(s.votes.created_at)).all(),
      });
    },
  );

  app.post(
    "/api/admin/import",
    describeRoute({
      operationId: "adminImport",
      tags: ["Admin"],
      summary: "Replace all data from a dump",
      security: security.admin,
      requestBody: {
        required: true,
        content: { "application/json": { schema: resolver(adminImportSchema) } },
      },
      responses: {
        200: jsonResponse(adminImportResultSchema, "Imported row counts"),
        400: errorResponse("Dangling reference in the dump"),
        403: errorResponse("Admin access denied"),
        404: errorResponse("Admin API disabled"),
        422: errorResponse("Validation error"),
      },
    }),
    async (c) => {
      requireAdmin(c);
      let payload: unknown;
      try {
        payload = await c.req.json();
      } catch {
        throw new ApiError(422, "invalid request body");
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new ApiError(422, "invalid request body");
      }
      const input = payload as Record<string, unknown>;
      const data = (
        input.data && typeof input.data === "object" && !Array.isArray(input.data)
          ? input.data
          : input
      ) as Record<string, unknown>;
      const rows = (key: string): Record<string, any>[] =>
        Array.isArray(data[key]) ? (data[key] as Record<string, any>[]) : [];
      const rooms = rows("rooms");
      const participants = rows("participants");
      const issues = rows("issues");
      const votes = rows("votes");
      const roomIds = new Set(rooms.map((room) => room.id));
      for (const participant of participants) {
        if (!roomIds.has(participant.room_id)) {
          throw new ApiError(400, `participant ${participant.id} points at an unknown room`);
        }
      }
      for (const issue of issues) {
        if (!roomIds.has(issue.room_id)) {
          throw new ApiError(400, `issue ${issue.id} points at an unknown room`);
        }
      }
      const participantIds = new Set(participants.map((participant) => participant.id));
      const issueIds = new Set(issues.map((issue) => issue.id));
      for (const vote of votes) {
        if (!roomIds.has(vote.room_id))
          throw new ApiError(400, `vote ${vote.id} points at an unknown room`);
        if (!issueIds.has(vote.issue_id))
          throw new ApiError(400, `vote ${vote.id} points at an unknown story`);
        if (!participantIds.has(vote.participant_id)) {
          throw new ApiError(400, `vote ${vote.id} points at an unknown participant`);
        }
      }
      db.transaction((tx) => {
        tx.delete(s.votes).run();
        tx.delete(s.issues).run();
        tx.delete(s.participants).run();
        tx.delete(s.rooms).run();
        for (const room of rooms) {
          tx.insert(s.rooms)
            .values({
              id: room.id,
              code: room.code,
              name: room.name,
              host_token: room.host_token,
              owner_id: room.owner_id ?? null,
              card_set:
                typeof room.card_set === "string"
                  ? room.card_set
                  : JSON.stringify(room.card_set ?? []),
              revealed: room.revealed ? 1 : 0,
              active_issue_id: room.active_issue_id ?? null,
              created_at: room.created_at,
              updated_at: room.updated_at,
            })
            .run();
        }
        for (const participant of participants) {
          tx.insert(s.participants)
            .values({
              id: participant.id,
              room_id: participant.room_id,
              name: participant.name,
              token: participant.token,
              is_spectator: participant.is_spectator ? 1 : 0,
              last_seen_at: participant.last_seen_at,
              created_at: participant.created_at,
            })
            .run();
        }
        for (const issue of issues) {
          tx.insert(s.issues)
            .values({
              id: issue.id,
              room_id: issue.room_id,
              title: issue.title,
              description: issue.description || "",
              link: issue.link || "",
              position: Math.trunc(Number(issue.position) || 0),
              estimate: issue.estimate ?? null,
              archived_at: issue.archived_at ?? null,
              created_at: issue.created_at,
            })
            .run();
        }
        for (const vote of votes) {
          tx.insert(s.votes)
            .values({
              id: vote.id,
              room_id: vote.room_id,
              issue_id: vote.issue_id,
              participant_id: vote.participant_id,
              value: vote.value,
              created_at: vote.created_at,
              updated_at: vote.updated_at,
            })
            .run();
        }
      });
      return c.json({
        rooms: rooms.length,
        participants: participants.length,
        issues: issues.length,
        votes: votes.length,
      });
    },
  );

  app.notFound((c) => c.json<Json>({ detail: "Not Found" }, 404));

  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json<Json>({ detail: error.detail }, error.status);
    if (error instanceof HTTPException) {
      if (error.status === 400) return c.json<Json>({ detail: "invalid request body" }, 422);
      return c.json<Json>({ detail: error.message || String(error.status) }, error.status);
    }
    console.error(error);
    return c.json<Json>({ detail: "Internal Server Error" }, 500);
  });

  return app;
}
