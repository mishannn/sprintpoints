import { Injectable } from "@nestjs/common";
import { badRequest, notFound } from "../common/api-exception";
import { newId, nowUtc } from "../common/identity";
import { issueView } from "../common/entity-views";
import { IssueDetailsDto, ImportIssuesDto } from "../common/request-dtos";
import { Issue } from "../database/entities";
import { RoomAccessService } from "../database/room-access.service";
import { UnitOfWork } from "../database/unit-of-work.service";

@Injectable()
export class IssuesService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly access: RoomAccessService,
  ) {}

  async create(roomId: string, dto: IssueDetailsDto, hostToken: string | undefined) {
    return this.unitOfWork.run(async (manager) => {
      const room = await this.access.requireHost(manager, roomId, hostToken);
      const title = dto.title.trim();
      if (!title) {
        return { value: null };
      }
      const timestamp = nowUtc();
      const issue = manager.create(Issue, {
        id: newId(),
        roomId: room.id,
        title,
        description: (dto.description ?? "").trim(),
        link: (dto.link ?? "").trim(),
        position: await this.access.nextIssuePosition(manager, room.id),
        estimate: null,
        archivedAt: null,
        createdAt: timestamp,
      });
      await manager.save(issue);

      room.activeIssueId = issue.id;
      room.revealed = false;
      await this.access.saveRoom(manager, room, timestamp);
      return { value: issueView(issue), notifyRoomId: room.id };
    });
  }

  async import(roomId: string, dto: ImportIssuesDto, hostToken: string | undefined) {
    return this.unitOfWork.run(async (manager) => {
      const room = await this.access.requireHost(manager, roomId, hostToken);
      const startPosition = await this.access.nextIssuePosition(manager, room.id);
      const timestamp = nowUtc();
      const imported: Issue[] = [];

      // Blank rows are skipped but retain their original position in the import.
      for (const [offset, item] of dto.issues.entries()) {
        const title = item.title.trim();
        if (!title) {
          continue;
        }
        const estimate = (item.estimate ?? "").trim();
        const issue = manager.create(Issue, {
          id: newId(),
          roomId: room.id,
          title,
          description: (item.description ?? "").trim(),
          link: (item.link ?? "").trim(),
          position: startPosition + offset,
          estimate: estimate || null,
          archivedAt: null,
          createdAt: timestamp,
        });
        await manager.save(issue);
        imported.push(issue);
      }

      if (imported.length > 0) {
        if (room.activeIssueId === null) {
          room.activeIssueId = imported[0].id;
          room.revealed = false;
          await this.access.saveRoom(manager, room, timestamp);
        }
        return { value: imported.map(issueView), notifyRoomId: room.id };
      }
      return { value: [] };
    });
  }

  async update(issueId: string, dto: IssueDetailsDto, hostToken: string | undefined) {
    return this.unitOfWork.run(async (manager) => {
      const issue = await this.access.findIssue(manager, issueId);
      await this.access.requireHost(manager, issue.roomId, hostToken);
      const title = dto.title.trim();
      if (!title) {
        throw badRequest("storyTitleRequired");
      }
      issue.title = title;
      issue.description = (dto.description ?? "").trim();
      issue.link = (dto.link ?? "").trim();
      await manager.update(Issue, { id: issue.id }, {
        title: issue.title,
        description: issue.description,
        link: issue.link,
      });
      return { value: issueView(issue), notifyRoomId: issue.roomId };
    });
  }

  async remove(
    roomId: string,
    issueId: string,
    nextActiveProvided: boolean,
    nextActiveIssueId: string | undefined,
    hostToken: string | undefined,
  ): Promise<void> {
    await this.unitOfWork.run(async (manager) => {
      const room = await this.access.requireHost(manager, roomId, hostToken);
      const issue = await this.access.findIssue(manager, issueId);
      if (issue.roomId !== room.id) {
        throw notFound("storyNotFound");
      }
      await manager.delete(Issue, { id: issue.id });

      if (room.activeIssueId === issue.id || nextActiveProvided) {
        room.activeIssueId = nextActiveIssueId ? nextActiveIssueId : null;
        room.revealed = false;
        await this.access.saveRoom(manager, room);
      }
      return { value: undefined, notifyRoomId: room.id };
    });
  }

  async archive(roomId: string, issueId: string, nextActiveIssueId: string | null, hostToken: string | undefined) {
    return this.unitOfWork.run(async (manager) => {
      const room = await this.access.requireHost(manager, roomId, hostToken);
      const issue = await this.access.findIssue(manager, issueId);
      if (issue.roomId !== room.id) {
        throw notFound("storyNotFound");
      }
      const timestamp = nowUtc();
      issue.archivedAt = timestamp;
      await manager.save(issue);

      if (room.activeIssueId === issue.id) {
        room.activeIssueId = nextActiveIssueId;
        room.revealed = false;
        await this.access.saveRoom(manager, room, timestamp);
      }
      return { value: issueView(issue), notifyRoomId: room.id };
    });
  }

  async archiveEstimated(roomId: string, nextActiveIssueId: string | null, hostToken: string | undefined) {
    return this.unitOfWork.run(async (manager) => {
      const room = await this.access.requireHost(manager, roomId, hostToken);
      const issues = await manager
        .createQueryBuilder(Issue, "issue")
        .where("issue.room_id = :roomId", { roomId: room.id })
        .andWhere("issue.archived_at IS NULL")
        .andWhere("issue.estimate IS NOT NULL")
        .andWhere("issue.estimate <> :empty", { empty: "" })
        .orderBy("issue.position", "ASC")
        .getMany();

      const timestamp = nowUtc();
      for (const issue of issues) {
        issue.archivedAt = timestamp;
        await manager.save(issue);
        if (room.activeIssueId === issue.id) {
          room.activeIssueId = nextActiveIssueId;
          room.revealed = false;
          await this.access.saveRoom(manager, room, timestamp);
        }
      }
      return {
        value: issues.map(issueView),
        ...(issues.length > 0 ? { notifyRoomId: room.id } : {}),
      };
    });
  }

  async unarchive(roomId: string, issueId: string, hostToken: string | undefined) {
    return this.unitOfWork.run(async (manager) => {
      const room = await this.access.requireHost(manager, roomId, hostToken);
      const issue = await this.access.findIssue(manager, issueId);
      if (issue.roomId !== room.id) {
        throw notFound("storyNotFound");
      }
      issue.archivedAt = null;
      await manager.save(issue);
      return { value: issueView(issue), notifyRoomId: room.id };
    });
  }

  async setActive(roomId: string, issueId: string | null, hostToken: string | undefined): Promise<void> {
    await this.unitOfWork.run(async (manager) => {
      const room = await this.access.requireHost(manager, roomId, hostToken);
      if (issueId !== null) {
        const issue = await this.access.findIssue(manager, issueId);
        if (issue.roomId !== room.id) {
          throw notFound("storyNotFound");
        }
      }
      room.activeIssueId = issueId;
      room.revealed = false;
      await this.access.saveRoom(manager, room);
      return { value: undefined, notifyRoomId: room.id };
    });
  }

  async setEstimate(issueId: string, value: string, hostToken: string | undefined): Promise<void> {
    await this.unitOfWork.run(async (manager) => {
      const issue = await this.access.findIssue(manager, issueId);
      await this.access.requireHost(manager, issue.roomId, hostToken);
      issue.estimate = value;
      await manager.update(Issue, { id: issue.id }, { estimate: issue.estimate });
      return { value: undefined, notifyRoomId: issue.roomId };
    });
  }
}
