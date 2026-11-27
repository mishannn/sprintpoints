// WebSocket smoke test: run with `node scripts/ws-test.mjs http://127.0.0.1:8787`
const base = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/, "");
const wsBase = base.replace(/^http/, "ws");

const post = async (path, body, headers = {}) => {
  const res = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const created = await post("/api/rooms", {
  roomName: "WS room",
  participantName: "Host",
  defaults: { roomName: "d", facilitatorName: "f", firstStoryTitle: "s" },
});
if (created.status !== 201) throw new Error("create failed " + created.status);

const { hostToken, participantToken, state } = created.body;
const roomId = state.room.id;

const messages = [];
const ws = new WebSocket(`${wsBase}/api/rooms/${roomId}/ws?participantToken=${participantToken}`);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve);
  ws.addEventListener("error", (event) => reject(new Error("ws error " + event.message)));
  setTimeout(() => reject(new Error("ws open timeout")), 15000);
});
console.log("ok  websocket open");

ws.addEventListener("message", (event) => messages.push(event.data));

await post(`/api/rooms/${roomId}/issues`, { title: "Broadcast me" }, { "X-Host-Token": hostToken });
await new Promise((resolve) => setTimeout(resolve, 1000));

if (messages.length !== 1 || JSON.parse(messages[0]).type !== "room_updated") {
  throw new Error("no room_updated broadcast: " + JSON.stringify(messages));
}
console.log("ok  room_updated broadcast received");

// Unauthorized socket must be refused.
const denied = new WebSocket(`${wsBase}/api/rooms/${roomId}/ws`);
const deniedResult = await new Promise((resolve) => {
  denied.addEventListener("open", () => resolve("open"));
  denied.addEventListener("error", () => resolve("error"));
  setTimeout(() => resolve("timeout"), 10000);
});
if (deniedResult !== "error") throw new Error("unauthorized socket was not refused: " + deniedResult);
console.log("ok  unauthorized socket refused");

ws.close();
console.log("\nAll WebSocket checks passed.");
