import { randomBytes, randomInt } from "crypto";
import { ROOM_CODE_ALPHABET } from "../../shared/roomCode.js";
import { CONFIG } from "./config.js";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < CONFIG.ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function generatePlayerId(): string {
  return "p_" + randomBytes(12).toString("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function randomPick<T>(arr: T[]): T {
  return arr[randomInt(arr.length)];
}

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
