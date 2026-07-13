import { io, type Socket } from "socket.io-client";
import type { QuestionsClientEvents, QuestionsServerEvents } from "../../../shared/types";

const baseUrl =
  import.meta.env?.DEV && typeof window !== "undefined"
    ? `http://${window.location.hostname}:3001`
    : "";

export const questionsSocket: Socket<QuestionsServerEvents, QuestionsClientEvents> = io(
  `${baseUrl}/questions`,
  { autoConnect: false },
);
