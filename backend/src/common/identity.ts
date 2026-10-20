import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "crypto";

export function newId(): string {
  return randomUUID();
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function newRoomCode(length = 6): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
}

export function nowUtc(): Date {
  return new Date();
}

export function normalizeRoomCode(value: string | undefined | null): string {
  return (value ?? "").trim().toUpperCase();
}

export function tokensEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
