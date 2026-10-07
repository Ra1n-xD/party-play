import type { ProfileSnapshot } from "./cosmetics.js";

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;

// Email is optional contact data, not a login or recovery credential.
export function normalizeEmail(value: unknown): string | null {
  if (value === undefined || value === "") return "";
  if (
    typeof value !== "string" ||
    value.length > EMAIL_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return null;
  const email = value.trim();
  if (!email) return "";
  const parts = email.split("@");
  if (
    parts.length !== 2 ||
    parts[0].length > 64 ||
    !/^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(parts[0]) ||
    parts[0].startsWith(".") ||
    parts[0].endsWith(".") ||
    parts[0].includes("..") ||
    !parts[1].includes(".") ||
    parts[1]
      .split(".")
      .some((label) => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))
  )
    return null;
  return `${parts[0]}@${parts[1].toLowerCase()}`;
}

export interface ProfileCredentials {
  nickname: string;
  password: string;
}

export interface ProfileRegistration extends ProfileCredentials {
  email?: string;
}

export interface ProfileUpdate {
  nickname: string;
  email: string;
  currentPassword: string;
  newPassword?: string;
}

export interface ProfileAccountDetails {
  email: string;
  testParticipant: boolean;
}

export interface ProfileAccountSnapshot {
  profile: ProfileSnapshot;
  account: ProfileAccountDetails;
}

export interface ProfileSession extends ProfileAccountSnapshot {
  sessionToken: string;
  expiresAt: number;
}
