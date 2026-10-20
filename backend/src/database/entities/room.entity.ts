import { Column, Entity, PrimaryColumn } from "typeorm";
import { TIMESTAMP_COLUMN_TYPE } from "../column-types";

@Entity({ name: "rooms" })
export class Room {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id: string;

  @Column({ name: "code", type: "varchar", length: 16, unique: true })
  code: string;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "host_token", type: "varchar", length: 255, unique: true })
  hostToken: string;

  @Column({ name: "owner_id", type: "varchar", length: 36, nullable: true })
  ownerId: string | null;

  @Column({ name: "card_set", type: "simple-json" })
  cardSet: string[];

  @Column({ name: "revealed", type: "boolean" })
  revealed: boolean;

  @Column({ name: "active_issue_id", type: "varchar", length: 36, nullable: true })
  activeIssueId: string | null;

  @Column({ name: "created_at", type: TIMESTAMP_COLUMN_TYPE })
  createdAt: Date;

  @Column({ name: "updated_at", type: TIMESTAMP_COLUMN_TYPE })
  updatedAt: Date;
}
