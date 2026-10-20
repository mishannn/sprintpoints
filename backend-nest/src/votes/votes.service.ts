import { Injectable } from "@nestjs/common";
import { forbidden, notFound } from "../common/api-exception";
import { newId, nowUtc } from "../common/identity";
import { VoteDto } from "../common/request-dtos";
import { Vote } from "../database/entities";
import { RoomAccessService } from "../database/room-access.service";
import { UnitOfWork } from "../database/unit-of-work.service";

@Injectable()
export class VotesService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly access: RoomAccessService,
  ) {}

  async cast(
    roomId: string,
    issueId: string,
    participantId: string,
    dto: VoteDto,
    participantToken: string | undefined,
  ): Promise<void> {
    await this.unitOfWork.run(async (manager) => {
      const participant = await this.access.requireParticipant(manager, participantId, participantToken);
      const issue = await this.access.findIssue(manager, issueId);
      if (participant.roomId !== roomId || issue.roomId !== roomId) {
        throw notFound("roomNotFound");
      }
      if (participant.isSpectator) {
        throw forbidden("spectatorsCannotVote");
      }

      const timestamp = nowUtc();
      await manager
        .createQueryBuilder()
        .insert()
        .into(Vote)
        .values({
          id: newId(),
          roomId: participant.roomId,
          issueId: issue.id,
          participantId: participant.id,
          value: dto.value,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .orUpdate(["value", "updated_at"], ["issue_id", "participant_id"])
        .execute();

      return { value: undefined, notifyRoomId: participant.roomId };
    });
  }

  async reveal(roomId: string, hostToken: string | undefined): Promise<void> {
    await this.unitOfWork.run(async (manager) => {
      const room = await this.access.requireHost(manager, roomId, hostToken);
      room.revealed = true;
      await this.access.saveRoom(manager, room);
      return { value: undefined, notifyRoomId: room.id };
    });
  }

  async reset(roomId: string, issueId: string, hostToken: string | undefined): Promise<void> {
    await this.unitOfWork.run(async (manager) => {
      const room = await this.access.requireHost(manager, roomId, hostToken);
      const issue = await this.access.findIssue(manager, issueId);
      if (issue.roomId !== room.id) {
        throw notFound("storyNotFound");
      }
      await manager.delete(Vote, { issueId: issue.id });
      room.revealed = false;
      await this.access.saveRoom(manager, room);
      return { value: undefined, notifyRoomId: room.id };
    });
  }

  async deleteVote(issueId: string, participantId: string, participantToken: string | undefined): Promise<void> {
    await this.unitOfWork.run(async (manager) => {
      const participant = await this.access.requireParticipant(manager, participantId, participantToken);
      const issue = await this.access.findIssue(manager, issueId);
      if (participant.roomId !== issue.roomId) {
        throw notFound("roomNotFound");
      }
      await manager.delete(Vote, { issueId: issue.id, participantId: participant.id });
      return { value: undefined, notifyRoomId: participant.roomId };
    });
  }
}
