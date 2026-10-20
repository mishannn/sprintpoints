import { Column, Entity, PrimaryColumn } from "typeorm";
import { TIMESTAMP_COLUMN_TYPE } from "../column-types";

@Entity({ name: "issues" })
export class Issue {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id: string;

  @Column({ name: "room_id", type: "varchar", length: 36 })
  roomId: string;

  @Column({ name: "title", type: "varchar", length: 500 })
  title: string;

  @Column({ name: "description", type: "text" })
  description: string;

  @Column({ name: "link", type: "varchar", length: 2048 })
  link: string;

  @Column({ name: "position", type: "integer" })
  position: number;

  @Column({ name: "estimate", type: "varchar", length: 64, nullable: true })
  estimate: string | null;

  @Column({ name: "archived_at", type: TIMESTAMP_COLUMN_TYPE, nullable: true })
  archivedAt: Date | null;

  @Column({ name: "created_at", type: TIMESTAMP_COLUMN_TYPE })
  createdAt: Date;
}
