import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  host_token: text("host_token").notNull().unique(),
  owner_id: text("owner_id"),
  card_set: text("card_set").notNull(),
  revealed: integer("revealed").notNull().default(0),
  active_issue_id: text("active_issue_id"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    room_id: text("room_id").notNull(),
    name: text("name").notNull(),
    token: text("token").notNull().unique(),
    is_spectator: integer("is_spectator").notNull().default(0),
    last_seen_at: text("last_seen_at").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [index("idx_participants_room").on(table.room_id, table.created_at)],
);

export const issues = sqliteTable(
  "issues",
  {
    id: text("id").primaryKey(),
    room_id: text("room_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    link: text("link").notNull().default(""),
    position: integer("position").notNull(),
    estimate: text("estimate"),
    archived_at: text("archived_at"),
    created_at: text("created_at").notNull(),
  },
  (table) => [index("idx_issues_room").on(table.room_id, table.position, table.created_at)],
);

export const votes = sqliteTable(
  "votes",
  {
    id: text("id").primaryKey(),
    room_id: text("room_id").notNull(),
    issue_id: text("issue_id").notNull(),
    participant_id: text("participant_id").notNull(),
    value: text("value").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_votes_room").on(table.room_id),
    uniqueIndex("idx_votes_issue_participant").on(table.issue_id, table.participant_id),
  ],
);

export type Room = typeof rooms.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type Vote = typeof votes.$inferSelect;
