import { io, Socket } from "socket.io-client";
import { ClientEvents, ServerEvents } from "../../shared/types";

// In dev mode, connect to the server on the same host (works for LAN access)
const URL = import.meta.env.DEV ? `http://${window.location.hostname}:3001` : "";

export const socket: Socket<ServerEvents, ClientEvents> = io(URL, {
  autoConnect: false,
});
