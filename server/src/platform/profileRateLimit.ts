import type { Socket } from "socket.io";
import { getSocketClientIdentity } from "../clientIdentity.js";

const limits = new Map<string, { count: number; expiresAt: number }>();
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of limits) if (value.expiresAt <= now) limits.delete(key);
}, 60_000);
cleanup.unref();

/** Shared across sockets, so reconnecting or opening another tab does not reset the budget. */
export function guardProfileRequest(socket: Socket): void {
  const now = Date.now();
  const accountId = socket.data.profileKey as string | undefined;
  const buckets = [
    { key: `ip:${getSocketClientIdentity(socket)}`, max: 240, window: 60_000 },
    ...(accountId
      ? [
          { key: `account:${accountId}`, max: 40, window: 60_000 },
          { key: `burst:${accountId}`, max: 8, window: 5_000 },
        ]
      : []),
  ];
  for (const bucket of buckets) {
    const entry = limits.get(bucket.key);
    if (
      (entry && entry.expiresAt > now && entry.count >= bucket.max) ||
      (!entry && limits.size >= 20_000)
    )
      throw new Error("Слишком много действий. Подождите немного");
  }
  for (const bucket of buckets) {
    const previous = limits.get(bucket.key);
    const entry =
      previous && previous.expiresAt > now
        ? previous
        : { count: 0, expiresAt: now + bucket.window };
    entry.count++;
    limits.set(bucket.key, entry);
  }
}
