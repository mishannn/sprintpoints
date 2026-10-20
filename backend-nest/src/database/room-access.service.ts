import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { forbidden, notFound } from "../common/api-exception";
import { nowUtc, tokensEqual } from "../common/identity";
import { Issue, Participant, Room } from "../database/entities";

@Injectable()
export class RoomAccessService {
  async findRoom(manager: EntityManager, id: string): Promise<Room> {
    const room = await manager.findOne(Room, { where: { id } });
    if (!room) {
      throw notFound("roomNotFound");
    }
    return room;
  }

  async findRoomByCode(manager: EntityManager, code: string): Promise<Room> {
    const room = await manager.findOne(Room, { where: { code } });
    if (!room) {
      throw notFound("roomNotFound");
    }
    return room;
  }

  async findIssue(manager: EntityManager, id: string): Promise<Issue> {
    const issue = await manager.findOne(Issue, { where: { id } });
    if (!issue) {
      throw notFound("storyNotFound");
    }
    return issue;
  }

  async findParticipant(manager: EntityManager, id: string): Promise<Participant> {
    const participant = await manager.findOne(Participant, { where: { id } });
    if (!participant) {
      throw notFound("participantNotFound");
    }
    return participant;
  }

  /** Serializes facilitator mutations on the room row in PostgreSQL. */
  async requireHost(manager: EntityManager, id: string, token: string | undefined | null): Promise<Room> {
    const query = manager.createQueryBuilder(Room, "room").where("room.id = :id", { id });
    if (manager.connection.options.type === "postgres") {
      query.setLock("pessimistic_write");
    }
    const room = await query.getOne();
    if (!room) {
      throw notFound("roomNotFound");
    }
    if (!tokensEqual(token, room.hostToken)) {
      throw forbidden("hostAccessDenied");
    }
    return room;
  }

  /** The participant lock prevents votes racing with a switch to spectator mode. */
  async requireParticipant(
    manager: EntityManager,
    id: string,
    token: string | undefined | null,
  ): Promise<Participant> {
    const query = manager.createQueryBuilder(Participant, "participant").where("participant.id = :id", { id });
    if (manager.connection.options.type === "postgres") {
      query.setLock("pessimistic_write");
    }
    const participant = await query.getOne();
    if (!participant) {
      throw notFound("participantNotFound");
    }
    if (!tokensEqual(token, participant.token)) {
      throw forbidden("participantAccessDenied");
    }
    return participant;
  }

  async requireMember(
    manager: EntityManager,
    room: Room,
    participantToken: string | null | undefined,
    hostToken: string | null | undefined,
  ): Promise<void> {
    if (tokensEqual(hostToken, room.hostToken)) {
      return;
    }
    if (participantToken) {
      const count = await manager.count(Participant, {
        where: { roomId: room.id, token: participantToken },
      });
      if (count > 0) {
        return;
      }
    }
    throw forbidden("roomAccessDenied");
  }

  async saveRoom(manager: EntityManager, room: Room, updatedAt: Date = nowUtc()): Promise<void> {
    room.updatedAt = updatedAt;
    await manager.save(room);
  }

  async nextIssuePosition(manager: EntityManager, roomId: string): Promise<number> {
    const raw = await manager
      .createQueryBuilder(Issue, "issue")
      .select("COALESCE(MAX(issue.position), 0) + 1", "position")
      .where("issue.room_id = :roomId", { roomId })
      .getRawOne<{ position: number | string }>();
    return Number(raw?.position ?? 1);
  }
}
