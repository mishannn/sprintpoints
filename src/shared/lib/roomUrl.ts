import { normalizeCode } from "./roomCode";

export const getJoinCodeFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return normalizeCode(params.get("room") ?? "");
};

export const setRoomUrl = (code: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  window.history.replaceState(null, "", url.toString());
};

export const getRoomInviteUrl = (code: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  return url.toString();
};
