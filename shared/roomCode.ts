export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function normalizeRoomCode(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();
  if (normalized.length !== ROOM_CODE_LENGTH) return null;

  return [...normalized].every((character) => ROOM_CODE_ALPHABET.includes(character))
    ? normalized
    : null;
}

export function sanitizeRoomCodeInput(value: string): string {
  return [...value.toUpperCase()]
    .filter((character) => ROOM_CODE_ALPHABET.includes(character))
    .slice(0, ROOM_CODE_LENGTH)
    .join("");
}
