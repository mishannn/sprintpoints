import {
  ADMIN_TOKEN_HEADER,
  HOST_TOKEN_HEADER,
  PARTICIPANT_TOKEN_HEADER,
} from "@sprintpoints/shared";
import { resolver } from "hono-openapi";
import { z } from "zod";

export const errorSchema = z.object({ detail: z.string() }).meta({ ref: "Error" });

export const healthSchema = z.object({ status: z.literal("ok") }).meta({ ref: "Health" });

export const roomSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    host_token: z.string(),
    owner_id: z.string().nullable(),
    card_set: z.array(z.string()),
    revealed: z.boolean(),
    active_issue_id: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ ref: "Room" });

export const participantSchema = z
  .object({
    id: z.string(),
    room_id: z.string(),
    name: z.string(),
    token: z.string(),
    is_spectator: z.boolean(),
    last_seen_at: z.string(),
    created_at: z.string(),
  })
  .meta({ ref: "Participant" });

export const issueSchema = z
  .object({
    id: z.string(),
    room_id: z.string(),
    title: z.string(),
    description: z.string(),
    link: z.string(),
    position: z.number().int(),
    estimate: z.string().nullable(),
    archived_at: z.string().nullable(),
    created_at: z.string(),
  })
  .meta({ ref: "Issue" });

export const voteSchema = z
  .object({
    id: z.string(),
    room_id: z.string(),
    issue_id: z.string(),
    participant_id: z.string(),
    value: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ ref: "Vote" });

export const roomStateSchema = z
  .object({
    room: roomSchema,
    participants: z.array(participantSchema),
    issues: z.array(issueSchema),
    votes: z.array(voteSchema),
  })
  .meta({ ref: "RoomState" });

export const createRoomResponseSchema = z
  .object({
    hostToken: z.string(),
    participantToken: z.string(),
    state: roomStateSchema,
    participant: participantSchema,
  })
  .meta({ ref: "CreateRoomResponse" });

export const joinRoomResponseSchema = z
  .object({
    room: roomSchema,
    participant: participantSchema,
    participantToken: z.string(),
  })
  .meta({ ref: "JoinRoomResponse" });

export const adminImportResultSchema = z
  .object({
    rooms: z.number().int(),
    participants: z.number().int(),
    issues: z.number().int(),
    votes: z.number().int(),
  })
  .meta({ ref: "AdminImportResult" });

const rawRoomSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    host_token: z.string(),
    owner_id: z.string().nullable(),
    card_set: z.string(),
    revealed: z.number().int(),
    active_issue_id: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ ref: "RoomRecord" });

const rawParticipantSchema = z
  .object({
    id: z.string(),
    room_id: z.string(),
    name: z.string(),
    token: z.string(),
    is_spectator: z.number().int(),
    last_seen_at: z.string(),
    created_at: z.string(),
  })
  .meta({ ref: "ParticipantRecord" });

const rawIssueSchema = issueSchema;

const rawVoteSchema = voteSchema;

export const adminExportSchema = z
  .object({
    rooms: z.array(rawRoomSchema),
    participants: z.array(rawParticipantSchema),
    issues: z.array(rawIssueSchema),
    votes: z.array(rawVoteSchema),
  })
  .meta({ ref: "AdminExport" });

const adminDumpSchema = z
  .object({
    rooms: z.array(rawRoomSchema).optional(),
    participants: z.array(rawParticipantSchema).optional(),
    issues: z.array(rawIssueSchema).optional(),
    votes: z.array(rawVoteSchema).optional(),
  })
  .meta({ ref: "AdminDump" });

export const adminImportSchema = z.union([adminDumpSchema, z.object({ data: adminDumpSchema })]);

export const openApiDocumentation = {
  openapi: "3.1.0",
  info: {
    title: "Sprint Points API",
    version: "3.0.0",
    description: "Realtime planning poker rooms, participants, story queues and voting.",
  },
  tags: [
    { name: "Health" },
    { name: "Rooms" },
    { name: "Participants" },
    { name: "Issues" },
    { name: "Votes" },
    { name: "Admin" },
  ],
  components: {
    securitySchemes: {
      HostToken: { type: "apiKey" as const, in: "header" as const, name: HOST_TOKEN_HEADER },
      ParticipantToken: {
        type: "apiKey" as const,
        in: "header" as const,
        name: PARTICIPANT_TOKEN_HEADER,
      },
      AdminToken: { type: "apiKey" as const, in: "header" as const, name: ADMIN_TOKEN_HEADER },
    },
  },
};

export const jsonResponse = (schema: z.ZodType, description: string) => ({
  description,
  content: { "application/json": { schema: resolver(schema) } },
});

export const errorResponse = (description: string) => jsonResponse(errorSchema, description);

export const emptyResponse = (description: string) => ({ description });

type Security = Record<string, string[]>[];

export const security: Record<"host" | "participant" | "member" | "admin", Security> = {
  host: [{ HostToken: [] }],
  participant: [{ ParticipantToken: [] }],
  member: [{ HostToken: [] }, { ParticipantToken: [] }],
  admin: [{ AdminToken: [] }],
};
