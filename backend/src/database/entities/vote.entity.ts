import { Column, Entity, PrimaryColumn, Unique } from "typeorm";
import { TIMESTAMP_COLUMN_TYPE } from "../column-types";

@Entity({ name: "votes" })
@Unique("uq_votes_issue_participant", ["issueId", "participantId"])
export class Vote {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id: string;

  @Column({ name: "room_id", type: "varchar", length: 36 })
  roomId: string;

  @Column({ name: "issue_id", type: "varchar", length: 36 })
  issueId: string;

  @Column({ name: "participant_id", type: "varchar", length: 36 })
  participantId: string;

  @Column({ name: "value", type: "varchar", length: 64 })
  value: string;

  @Column({ name: "created_at", type: TIMESTAMP_COLUMN_TYPE })
  createdAt: Date;

  @Column({ name: "updated_at", type: TIMESTAMP_COLUMN_TYPE })
  updatedAt: Date;
}
