/** Angles in radians, relative to a player's seat facing the centre of the table. */
export interface AvatarLook {
  yaw: number;
  pitch: number;
}

export interface AvatarLookEvent extends AvatarLook {
  roomCode: string;
  seatId: string;
}

export const AVATAR_YAW_LIMIT = Math.PI / 2;
export const AVATAR_PITCH_MIN = -1.05;
export const AVATAR_PITCH_MAX = 0.35;
export const AVATAR_LOOK_INTERVAL_MS = 100;
export const AVATAR_LOOK_EXPIRY_MS = 3_000;

export function isAvatarLook(value: unknown): value is AvatarLook {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const look = value as Partial<AvatarLook>;
  return (
    typeof look.yaw === "number" &&
    Number.isFinite(look.yaw) &&
    typeof look.pitch === "number" &&
    Number.isFinite(look.pitch) &&
    Math.abs(look.yaw) <= AVATAR_YAW_LIMIT &&
    look.pitch >= AVATAR_PITCH_MIN &&
    look.pitch <= AVATAR_PITCH_MAX
  );
}
