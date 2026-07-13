import { io, type Socket } from "socket.io-client";
import type { WeddingClientEvents, WeddingServerEvents } from "../../../shared/types";

const baseUrl =
  import.meta.env?.DEV && typeof window !== "undefined"
    ? `http://${window.location.hostname}:3001`
    : "";

export const weddingSocket: Socket<WeddingServerEvents, WeddingClientEvents> = io(
  `${baseUrl}/wedding`,
  { autoConnect: false },
);
