import { Injectable } from "@nestjs/common";
import { notFound } from "../common/api-exception";
import { nowUtc } from "../common/identity";
import { participantView } from "../common/entity-views";
import { UpdateParticipantDto } from "../common/request-dtos";
import { Participant, Vote } from "../database/entities";
import { RoomAccessService } from "../database/room-access.service";
import { UnitOfWork } from "../database/unit-of-work.service";

@Injectable()
export class ParticipantsService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly access: RoomAccessService,
  ) {}

  async heartbeat(participantId: string, participantToken: string | undefined): Promise<void> {
    await this.unitOfWork.run(async (manager) => {
      const participant = await this.access.requireParticipant(manager, participantId, participantToken);
      participant.lastSeenAt = nowUtc();
      await manager.update(Participant, { id: participant.id }, { lastSeenAt: participant.lastSeenAt });
      return { value: undefined };
    });
  }

  async update(participantId: string, dto: UpdateParticipantDto, participantToken: string | undefined) {
    return this.unitOfWork.run(async (manager) => {
      const participant = await this.access.requireParticipant(manager, participantId, participantToken);
      participant.isSpectator = dto.isSpectator;

      if (participant.isSpectator) {
        const room = await this.access.findRoom(manager, participant.roomId);
        if (room.activeIssueId) {
          await manager.delete(Vote, { issueId: room.activeIssueId, participantId: participant.id });
        }
      }

      await manager.update(Participant, { id: participant.id }, { isSpectator: participant.isSpectator });
      return {
        value: participantView(participant, participantToken),
        notifyRoomId: participant.roomId,
      };
    });
  }

  async remove(roomId: string, participantId: string, hostToken: string | undefined): Promise<void> {
    await this.unitOfWork.run(async (manager) => {
      const room = await this.access.requireHost(manager, roomId, hostToken);
      const participant = await this.access.findParticipant(manager, participantId);
      if (participant.roomId !== room.id) {
        throw notFound("participantNotFound");
      }
      await manager.delete(Participant, { id: participant.id });
      return { value: undefined, notifyRoomId: room.id };
    });
  }
}
