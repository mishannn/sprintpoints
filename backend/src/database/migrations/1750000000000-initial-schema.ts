import { MigrationInterface, QueryRunner } from "typeorm";
import { TIMESTAMP_COLUMN_TYPE } from "../column-types";

/**
 * Shared PostgreSQL/SQLite schema. `card_set` is stored as JSON text so the
 * same entity mapping works on both drivers; timestamps are UTC wall time.
 */
export class InitialSchema1750000000000 implements MigrationInterface {
  name = "InitialSchema1750000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rooms" (
        "id" varchar(36) PRIMARY KEY,
        "code" varchar(16) NOT NULL UNIQUE,
        "name" varchar(255) NOT NULL,
        "host_token" varchar(255) NOT NULL UNIQUE,
        "owner_id" varchar(36),
        "card_set" text NOT NULL,
        "revealed" boolean NOT NULL,
        "active_issue_id" varchar(36),
        "created_at" ${TIMESTAMP_COLUMN_TYPE} NOT NULL,
        "updated_at" ${TIMESTAMP_COLUMN_TYPE} NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "participants" (
        "id" varchar(36) PRIMARY KEY,
        "room_id" varchar(36) NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
        "name" varchar(255) NOT NULL,
        "token" varchar(255) NOT NULL UNIQUE,
        "is_spectator" boolean NOT NULL,
        "last_seen_at" ${TIMESTAMP_COLUMN_TYPE} NOT NULL,
        "created_at" ${TIMESTAMP_COLUMN_TYPE} NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "participants_room_id_idx" ON "participants" ("room_id")`);
    await queryRunner.query(`
      CREATE TABLE "issues" (
        "id" varchar(36) PRIMARY KEY,
        "room_id" varchar(36) NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
        "title" varchar(500) NOT NULL,
        "description" text NOT NULL,
        "link" varchar(2048) NOT NULL,
        "position" integer NOT NULL,
        "estimate" varchar(64),
        "archived_at" ${TIMESTAMP_COLUMN_TYPE},
        "created_at" ${TIMESTAMP_COLUMN_TYPE} NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "issues_room_id_position_idx" ON "issues" ("room_id", "position")`);
    await queryRunner.query(`
      CREATE TABLE "votes" (
        "id" varchar(36) PRIMARY KEY,
        "room_id" varchar(36) NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
        "issue_id" varchar(36) NOT NULL REFERENCES "issues"("id") ON DELETE CASCADE,
        "participant_id" varchar(36) NOT NULL REFERENCES "participants"("id") ON DELETE CASCADE,
        "value" varchar(64) NOT NULL,
        "created_at" ${TIMESTAMP_COLUMN_TYPE} NOT NULL,
        "updated_at" ${TIMESTAMP_COLUMN_TYPE} NOT NULL,
        CONSTRAINT "uq_votes_issue_participant" UNIQUE ("issue_id", "participant_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "votes_room_id_idx" ON "votes" ("room_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "votes"`);
    await queryRunner.query(`DROP TABLE "issues"`);
    await queryRunner.query(`DROP TABLE "participants"`);
    await queryRunner.query(`DROP TABLE "rooms"`);
  }
}
