import { ROOM_UPDATED_MESSAGE } from "@sprintpoints/shared";
import { DurableObject } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../drizzle/migrations";
import openapi from "../openapi.json";
import { createApp } from "./app";
import type { Env } from "./env";
import { tokenEq } from "./lib";
import * as schema from "./schema";

const WS_PATH = /^\/api\/rooms\/([^/]+)\/ws\/?$/;

export class RoomDatabase extends DurableObject<Env> {
  private readonly db: DrizzleSqliteDODatabase<typeof schema>;
  private readonly app: ReturnType<typeof createApp>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema });
    this.app = createApp(this.db, (roomId) => this.broadcast(roomId));
    ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/openapi.json") {
      return Response.json(openapi);
    }
    const match = WS_PATH.exec(url.pathname);
    if (match) return this.websocket(request, match[1]);
    return this.app.fetch(request, this.env);
  }

  private websocket(request: Request, roomId: string): Response {
    if ((request.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    const query = new URL(request.url).searchParams;
    if (!this.authorized(roomId, query.get("participantToken"), query.get("hostToken"))) {
      return new Response("Room access denied", { status: 403 });
    }
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.serializeAttachment(roomId);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private authorized(
    roomId: string,
    participantToken: string | null,
    hostToken: string | null,
  ): boolean {
    const room = this.db.select().from(schema.rooms).where(eq(schema.rooms.id, roomId)).get();
    if (!room) return false;
    if (tokenEq(hostToken, room.host_token)) return true;
    return !!(
      participantToken &&
      this.db
        .select({ id: schema.participants.id })
        .from(schema.participants)
        .where(
          and(
            eq(schema.participants.room_id, roomId),
            eq(schema.participants.token, participantToken),
          ),
        )
        .get()
    );
  }

  private broadcast(roomId: string) {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        if (socket.deserializeAttachment() === roomId) socket.send(ROOM_UPDATED_MESSAGE);
      } catch {
        // A socket can disappear between listing it and sending.
      }
    }
  }
}

export default {
  fetch(request: Request, env: Env) {
    return env.ROOMS.getByName("main").fetch(request);
  },
} satisfies ExportedHandler<Env>;
