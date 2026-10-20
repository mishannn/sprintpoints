import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { DataSource } from "typeorm";
import WebSocket, { WebSocketServer } from "ws";
import { RoomAccessService } from "../database/room-access.service";

const ROOM_SOCKET_PATH = /^\/api\/rooms\/([^/]+)\/ws\/?$/;

/**
 * Process-local WebSocket fanout. The service attaches to the HTTP server's
 * upgrade event so clients can use the plain WebSocket protocol exposed by the
 * original backend (no Socket.IO handshake).
 */
@Injectable()
export class RoomHub implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RoomHub.name);
  private readonly server = new WebSocketServer({ noServer: true });
  private readonly sockets = new Map<string, Set<WebSocket>>();
  private readonly upgradeHandler = (request: Parameters<WebSocketServer["handleUpgrade"]>[0], socket: any, head: Buffer) =>
    this.handleUpgrade(request, socket, head);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly dataSource: DataSource,
    private readonly access: RoomAccessService,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.adapterHost.httpAdapter.getHttpServer();
    httpServer.on("upgrade", this.upgradeHandler);
  }

  onApplicationShutdown(): void {
    const httpServer = this.adapterHost.httpAdapter?.getHttpServer?.();
    httpServer?.off("upgrade", this.upgradeHandler);
    for (const set of this.sockets.values()) {
      for (const socket of set) {
        socket.terminate();
      }
    }
    this.sockets.clear();
    this.server.close();
  }

  broadcast(roomId: string): void {
    const set = this.sockets.get(roomId);
    if (!set || set.size === 0) {
      return;
    }
    const payload = JSON.stringify({ type: "room_updated" });
    for (const socket of set) {
      if (socket.readyState !== WebSocket.OPEN) {
        set.delete(socket);
        continue;
      }
      try {
        socket.send(payload);
      } catch {
        set.delete(socket);
        socket.terminate();
      }
    }
    if (set.size === 0) {
      this.sockets.delete(roomId);
    }
  }

  private handleUpgrade(request: any, socket: any, head: Buffer): void {
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://localhost");
    } catch {
      socket.destroy();
      return;
    }
    const match = ROOM_SOCKET_PATH.exec(url.pathname);
    if (!match) {
      socket.destroy();
      return;
    }
    const roomId = decodeURIComponent(match[1]);

    this.server.handleUpgrade(request, socket, head, (client) => {
      this.server.emit("connection", client, request);
      void this.authorizeAndRegister(roomId, url, client);
    });
  }

  private async authorizeAndRegister(roomId: string, url: URL, socket: WebSocket): Promise<void> {
    let authorized = false;
    try {
      authorized = await this.dataSource.transaction(async (manager) => {
        const room = await this.access.findRoom(manager, roomId);
        await this.access.requireMember(
          manager,
          room,
          url.searchParams.get("participantToken"),
          url.searchParams.get("hostToken"),
        );
        return true;
      });
    } catch {
      authorized = false;
    }

    if (!authorized) {
      socket.close(1008);
      return;
    }

    let roomSockets = this.sockets.get(roomId);
    if (!roomSockets) {
      roomSockets = new Set();
      this.sockets.set(roomId, roomSockets);
    }
    roomSockets.add(socket);
    socket.on("message", () => undefined);
    socket.on("error", () => this.unregister(roomId, socket));
    socket.on("close", () => this.unregister(roomId, socket));
  }

  private unregister(roomId: string, socket: WebSocket): void {
    const set = this.sockets.get(roomId);
    if (!set) {
      return;
    }
    set.delete(socket);
    if (set.size === 0) {
      this.sockets.delete(roomId);
    }
  }
}
