import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { RoomHub } from "../realtime/room-hub.service";

export type TransactionOutcome<T> = {
  value: T;
  notifyRoomId?: string;
};

/**
 * Runs one API mutation in a database transaction and broadcasts the room
 * update only after the transaction has committed.
 */
@Injectable()
export class UnitOfWork {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly dataSource: DataSource,
    private readonly hub: RoomHub,
  ) {}

  async run<T>(work: (manager: EntityManager) => Promise<TransactionOutcome<T>>): Promise<T> {
    // SQLite exposes one synchronous connection. Serialize transactions so
    // concurrent requests behave like the single-connection development setup.
    if (this.dataSource.options.type === "postgres") {
      return this.execute(work);
    }
    return this.enqueue(() => this.execute(work));
  }

  private async execute<T>(work: (manager: EntityManager) => Promise<TransactionOutcome<T>>): Promise<T> {
    const outcome = await this.dataSource.transaction(work);
    if (outcome.notifyRoomId) {
      this.hub.broadcast(outcome.notifyRoomId);
    }
    return outcome.value;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
