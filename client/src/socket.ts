import { io, Socket } from "socket.io-client";
import { ClientEvents, ServerEvents } from "../../shared/types";

// In dev mode, connect to the server on the same host (works for LAN access)
// In production, connect to same origin (nginx proxies /socket.io/ to the server)
const URL = import.meta.env.DEV ? `http://${window.location.hostname}:3001` : undefined;

export const socket: Socket<ServerEvents, ClientEvents> = io(URL ?? "", {
  autoConnect: false,
});
