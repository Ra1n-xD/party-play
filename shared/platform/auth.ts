import type { ProfileSnapshot } from "./cosmetics.js";

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

export interface ProfileCredentials {
  nickname: string;
  password: string;
}

export interface ProfileSession {
  profile: ProfileSnapshot;
  sessionToken: string;
  expiresAt: number;
}
