import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { badRequest, notFound, serviceUnavailable } from "../common/api-exception";
import { newId, newRoomCode, newToken, normalizeRoomCode, nowUtc, tokensEqual } from "../common/identity";
import { issueView, participantView, roomView, voteView } from "../common/entity-views";
import { CreateRoomDto, JoinRoomDto, TransferOwnershipDto } from "../common/request-dtos";
import { RoomState } from "../common/views";
import { Issue, Participant, Room, Vote } from "../database/entities";
import { RoomAccessService } from "../database/room-access.service";
import { UnitOfWork } from "../database/unit-of-work.service";

const DEFAULT_CARD_SET = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "Coffee"];

@Injectable()
export class RoomsService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly access: RoomAccessService,
  ) {}

  async create(dto: CreateRoomDto) {
    return this.unitOfWork.run(async (manager) => {
      const timestamp = nowUtc();
      const roomId = newId();
      const participantId = newId();
      const issueId = newId();
      const code = await this.allocateRoomCode(manager);
      const roomName = dto.roomName.trim() || dto.defaults.roomName;
      const participantName = dto.participantName.trim() || dto.defaults.facilitatorName;

      const room = manager.create(Room, {
        id: roomId,
        code,
        name: roomName,
        hostToken: newToken(),
        ownerId: participantId,
        cardSet: [...DEFAULT_CARD_SET],
        revealed: false,
        activeIssueId: issueId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const participant = manager.create(Participant, {
        id: participantId,
        roomId,
        name: participantName,
        token: newToken(),
        isSpectator: false,
        lastSeenAt: timestamp,
        createdAt: timestamp,
      });
      const issue = manager.create(Issue, {
        id: issueId,
        roomId,
        title: dto.defaults.firstStoryTitle,
        description: "",
        link: "",
        position: 1,
        estimate: null,
        archivedAt: null,
        createdAt: timestamp,
      });

      await manager.save(room);
      await manager.save(participant);
      await manager.save(issue);

      const state = await this.roomState(manager, room, participant.token, room.hostToken);
      return {
        value: {
          hostToken: room.hostToken,
          participantToken: participant.token,
          state,
          participant: participantView(participant, participant.token),
        },
      };
    });
  }

  async join(code: string, dto: JoinRoomDto) {
    return this.unitOfWork.run(async (manager) => {
      const normalizedCode = normalizeRoomCode(code);
      const participantName = dto.name.trim();
      if (!normalizedCode || !participantName) {
        throw badRequest("joinRoomRequired");
      }
      const room = await this.access.findRoomByCode(manager, normalizedCode);
      const timestamp = nowUtc();
      const participant = manager.create(Participant, {
        id: newId(),
        roomId: room.id,
        name: participantName,
        token: newToken(),
        isSpectator: dto.isSpectator,
        lastSeenAt: timestamp,
        createdAt: timestamp,
      });
      await manager.save(participant);
      return {
        value: {
          room: roomView(room, false),
          participant: participantView(participant, participant.token),
          participantToken: participant.token,
        },
        notifyRoomId: room.id,
      };
    });
  }

  async load(code: string, participantToken: string | undefined, hostToken: string | undefined): Promise<RoomState> {
    return this.unitOfWork.run(async (manager) => {
      const room = await this.access.findRoomByCode(manager, normalizeRoomCode(code));
      await this.access.requireMember(manager, room, participantToken, hostToken);
      return { value: await this.roomState(manager, room, participantToken, hostToken) };
    });
  }

  async transferOwnership(roomId: string, dto: TransferOwnershipDto, hostToken: string | undefined): Promise<void> {
    await this.unitOfWork.run(async (manager) => {
      const room = await this.access.requireHost(manager, roomId, hostToken);
      const participant = await this.access.findParticipant(manager, dto.participantId);
      if (participant.roomId !== room.id) {
        throw notFound("participantNotFound");
      }
      room.hostToken = newToken();
      room.ownerId = participant.id;
      await this.access.saveRoom(manager, room);
      return { value: undefined, notifyRoomId: room.id };
    });
  }

  async roomState(
    manager: EntityManager,
    room: Room,
    participantToken: string | undefined,
    hostToken: string | undefined,
  ): Promise<RoomState> {
    const participants = await manager.find(Participant, { where: { roomId: room.id }, order: { createdAt: "ASC" } });
    const issues = await manager.find(Issue, {
      where: { roomId: room.id },
      order: { position: "ASC", createdAt: "ASC" },
    });
    const votes = await manager.find(Vote, { where: { roomId: room.id } });

    let revealHostToken = tokensEqual(hostToken, room.hostToken);
    for (const participant of participants) {
      if (room.ownerId && participant.id === room.ownerId && tokensEqual(participantToken, participant.token)) {
        revealHostToken = true;
      }
    }

    return {
      room: roomView(room, revealHostToken),
      participants: participants.map((participant) => participantView(participant, participantToken)),
      issues: issues.map(issueView),
      votes: votes.map(voteView),
    };
  }

  private async allocateRoomCode(manager: EntityManager): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = newRoomCode();
      const count = await manager.count(Room, { where: { code: candidate } });
      if (count === 0) {
        return candidate;
      }
    }
    throw serviceUnavailable("roomCodeUnavailable");
  }
}
