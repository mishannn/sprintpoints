// Request-body schemas shared by the frontend and the Worker. The backend
// validates with these same Zod schemas. Unknown keys are stripped by Zod.
//
// Field names stay camelCase because they are the public JSON input shape.

import { z } from "zod";

export const createRoomDefaultsSchema = z.object({
  roomName: z.string(),
  facilitatorName: z.string(),
  firstStoryTitle: z.string(),
});

export const createRoomSchema = z.object({
  roomName: z.string(),
  participantName: z.string(),
  defaults: createRoomDefaultsSchema,
});

export const joinRoomSchema = z.object({
  name: z.string(),
  isSpectator: z.boolean(),
});

export const transferOwnershipSchema = z.object({
  participantId: z.string(),
});

export const updateParticipantSchema = z.object({
  isSpectator: z.boolean(),
});

export const issueDetailsSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
});

export const importIssueSchema = issueDetailsSchema.extend({
  estimate: z.string().nullable().optional(),
});

export const importIssuesSchema = z.object({
  issues: z.array(importIssueSchema),
});

export const voteSchema = z.object({
  value: z.string(),
});

export const estimateSchema = z.object({
  value: z.string(),
});

// Nullable but required: sending {} is a validation error, sending null is not.
export const activeIssueSchema = z.object({
  issueId: z.string().nullable(),
});

export const nextActiveIssueSchema = z.object({
  nextActiveIssueId: z.string().nullable(),
});

export type CreateRoomDefaults = z.infer<typeof createRoomDefaultsSchema>;
export type CreateRoomBody = z.infer<typeof createRoomSchema>;
export type JoinRoomBody = z.infer<typeof joinRoomSchema>;
export type TransferOwnershipBody = z.infer<typeof transferOwnershipSchema>;
export type UpdateParticipantBody = z.infer<typeof updateParticipantSchema>;
export type IssueDetailsBody = z.infer<typeof issueDetailsSchema>;
export type ImportIssueBody = z.infer<typeof importIssueSchema>;
export type ImportIssuesBody = z.infer<typeof importIssuesSchema>;
export type VoteBody = z.infer<typeof voteSchema>;
export type EstimateBody = z.infer<typeof estimateSchema>;
export type ActiveIssueBody = z.infer<typeof activeIssueSchema>;
export type NextActiveIssueBody = z.infer<typeof nextActiveIssueSchema>;
