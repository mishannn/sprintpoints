import WebSocket from "ws";
import { createFixture } from "./fixture";

function waitForMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket message timeout")), 3000);
    socket.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket close timeout")), 3000);
    socket.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

describe("WebSocket room updates", () => {
  it("broadcasts room_updated after the transaction commits", async () => {
    const fixture = await createFixture();
    try {
      const { result, state } = await fixture.createRoom();
      const room = state.room;
      const socket = new WebSocket(
        `${fixture.url.replace(/^http/, "ws")}/api/rooms/${room.id}/ws?participantToken=${encodeURIComponent(result.participantToken)}`,
      );
      await new Promise<void>((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });

      const message = waitForMessage(socket);
      const created = await fixture.request(
        "POST",
        `/api/rooms/${room.id}/issues`,
        { title: "Pushed", description: "", link: "" },
        { "X-Host-Token": result.hostToken },
      );
      expect(created.status).toBe(201);
      expect(await message).toEqual({ type: "room_updated" });

      const loaded = await fixture.request("GET", `/api/rooms/${room.code}`, undefined, {
        "X-Participant-Token": result.participantToken,
      });
      expect(loaded.body.issues.some((issue: any) => issue.title === "Pushed")).toBe(true);
      socket.close();
    } finally {
      await fixture.close();
    }
  });

  it("closes non-member subscriptions with policy violation code 1008", async () => {
    const fixture = await createFixture();
    try {
      const first = await fixture.createRoom();
      const second = await fixture.createRoom();
      const roomId = first.state.room.id;
      const foreignToken = second.state.participants[0].token;
      const socket = new WebSocket(
        `${fixture.url.replace(/^http/, "ws")}/api/rooms/${roomId}/ws?participantToken=${encodeURIComponent(foreignToken)}`,
      );
      const closed = waitForClose(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
      expect(await closed).toBe(1008);
    } finally {
      await fixture.close();
    }
  });
});
