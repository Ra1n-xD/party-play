import { brandStorage } from "./brandStorage";
export const PROFILE_SESSION_KEY = "partyside_profile_session_v2";
let memoryToken: string | null = null;

export function readProfileSession(): string | null {
  try {
    const token = brandStorage.getItem(PROFILE_SESSION_KEY);
    memoryToken = token && /^[0-9a-f]{64}$/.test(token) ? token : null;
  } catch {
    /* Keep the session in memory when browser storage is unavailable. */
  }
  return memoryToken;
}

export function saveProfileSession(token: string | null): void {
  memoryToken = token;
  try {
    if (token) brandStorage.setItem(PROFILE_SESSION_KEY, token);
    else brandStorage.removeItem(PROFILE_SESSION_KEY);
    brandStorage.removeItem("partyside_nickname_v1");
  } catch {
    /* Registration and login still work for this tab. */
  }
}
