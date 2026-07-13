import type { ExtendedError, Socket } from "socket.io";
import { getSocketClientIdentity } from "./clientIdentity.js";

export function createNamespaceConnectionLimiter(
  maxConnectionsPerIp: number,
  counts: Map<string, number> = new Map(),
): (socket: Socket, next: (error?: ExtendedError) => void) => void {
  return (socket, next) => {
    const ip = getSocketClientIdentity(socket);
    const count = counts.get(ip) ?? 0;
    if (count >= maxConnectionsPerIp) {
      next(new Error("Too many connections from this IP"));
      return;
    }

    counts.set(ip, count + 1);
    socket.on("disconnect", () => {
      const current = counts.get(ip) ?? 1;
      if (current <= 1) counts.delete(ip);
      else counts.set(ip, current - 1);
    });
    next();
  };
}
