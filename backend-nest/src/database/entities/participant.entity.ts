import { Column, Entity, PrimaryColumn } from "typeorm";
import { TIMESTAMP_COLUMN_TYPE } from "../column-types";

@Entity({ name: "participants" })
export class Participant {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id: string;

  @Column({ name: "room_id", type: "varchar", length: 36 })
  roomId: string;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "token", type: "varchar", length: 255, unique: true })
  token: string;

  @Column({ name: "is_spectator", type: "boolean" })
  isSpectator: boolean;

  @Column({ name: "last_seen_at", type: TIMESTAMP_COLUMN_TYPE })
  lastSeenAt: Date;

  @Column({ name: "created_at", type: TIMESTAMP_COLUMN_TYPE })
  createdAt: Date;
}
