import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import type { ClientEvents, ServerEvents } from "../../../shared/types.js";
import { getAllRooms } from "../../src/roomManager.js";
import { registerHandlers, resetSocketHandlerStateForTests } from "../../src/socketHandlers.js";

type EventPayload<Event extends keyof ServerEvents> = ServerEvents[Event] extends (
  data: infer Payload,
) => void
  ? Payload
  : never;

type EventArguments<Event extends keyof ClientEvents> = Parameters<ClientEvents[Event]>;

interface PendingWaiter {
  accept: (payload: unknown) => boolean;
  cancel: (error: Error) => void;
}

export interface SocketTestClient {
  readonly socket: ClientSocket<ServerEvents, ClientEvents>;
  emit<Event extends keyof ClientEvents>(event: Event, ...args: EventArguments<Event>): void;
  waitFor<Event extends keyof ServerEvents>(
    event: Event,
    predicate?: (payload: EventPayload<Event>) => boolean,
  ): Promise<EventPayload<Event>>;
  disconnect(): void;
}

export interface SocketTestServer {
  url: string;
  io: Server<ClientEvents, ServerEvents>;
  connectClient(): Promise<SocketTestClient>;
  close(): Promise<void>;
}

const EVENT_TIMEOUT_MS = 5_000;

function wrapClient(socket: ClientSocket<ServerEvents, ClientEvents>): SocketTestClient & {
  dispose: () => void;
} {
  const queuedEvents = new Map<keyof ServerEvents, unknown[]>();
  const pendingWaiters = new Map<keyof ServerEvents, PendingWaiter[]>();

  socket.onAny((event, payload: unknown) => {
    const typedEvent = event as keyof ServerEvents;
    const waiters = pendingWaiters.get(typedEvent);
    const acceptedIndex = waiters?.findIndex((waiter) => waiter.accept(payload)) ?? -1;

    if (waiters && acceptedIndex >= 0) {
      waiters.splice(acceptedIndex, 1);
      if (waiters.length === 0) pendingWaiters.delete(typedEvent);
      return;
    }

    const queued = queuedEvents.get(typedEvent) ?? [];
    queued.push(payload);
    queuedEvents.set(typedEvent, queued);
  });

  const client: SocketTestClient & { dispose: () => void } = {
    socket,
    emit(event, ...args) {
      socket.emit(event, ...args);
    },
    waitFor(event, predicate = () => true) {
      const queued = queuedEvents.get(event) ?? [];
      const queuedIndex = queued.findIndex((payload) =>
        predicate(payload as EventPayload<typeof event>),
      );

      if (queuedIndex >= 0) {
        const [payload] = queued.splice(queuedIndex, 1);
        if (queued.length === 0) queuedEvents.delete(event);
        return Promise.resolve(payload as EventPayload<typeof event>);
      }

      return new Promise<EventPayload<typeof event>>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const waiter: PendingWaiter = {
          accept(payload) {
            if (!predicate(payload as EventPayload<typeof event>)) return false;
            clearTimeout(timer);
            resolve(payload as EventPayload<typeof event>);
            return true;
          },
          cancel(error) {
            clearTimeout(timer);
            reject(error);
          },
        };

        const waiters = pendingWaiters.get(event) ?? [];
        waiters.push(waiter);
        pendingWaiters.set(event, waiters);

        timer = setTimeout(() => {
          const activeWaiters = pendingWaiters.get(event);
          const waiterIndex = activeWaiters?.indexOf(waiter) ?? -1;
          if (activeWaiters && waiterIndex >= 0) activeWaiters.splice(waiterIndex, 1);
          if (activeWaiters?.length === 0) pendingWaiters.delete(event);
          reject(new Error(`Timed out waiting for Socket.IO event: ${String(event)}`));
        }, EVENT_TIMEOUT_MS);
      });
    },
    disconnect() {
      socket.disconnect();
    },
    dispose() {
      for (const waiters of pendingWaiters.values()) {
        for (const waiter of waiters) {
          waiter.cancel(new Error("Socket test client closed"));
        }
      }
      pendingWaiters.clear();
      queuedEvents.clear();
      socket.removeAllListeners();
      socket.disconnect();
    },
  };

  return client;
}

async function connectSocket(
  url: string,
  clients: Set<SocketTestClient & { dispose: () => void }>,
): Promise<SocketTestClient> {
  const socket: ClientSocket<ServerEvents, ClientEvents> = createClient(url, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
  });
  const client = wrapClient(socket);
  clients.add(client);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out connecting Socket.IO test client"));
    }, EVENT_TIMEOUT_MS);

    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.connect();
  });

  return client;
}

export async function createSocketTestServer(): Promise<SocketTestServer> {
  const httpServer = createServer();
  const io = new Server<ClientEvents, ServerEvents>(httpServer);
  const clients = new Set<SocketTestClient & { dispose: () => void }>();
  let closed = false;

  registerHandlers(io);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const address = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    io,
    connectClient: () => connectSocket(url, clients),
    async close() {
      if (closed) return;
      closed = true;

      for (const serverSocket of io.sockets.sockets.values()) {
        serverSocket.removeAllListeners("disconnect");
      }
      for (const client of clients) client.dispose();
      clients.clear();

      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
        });
      }

      for (const room of getAllRooms().values()) {
        if (room.gameState?.phaseTimer) clearTimeout(room.gameState.phaseTimer);
      }
      getAllRooms().clear();
      resetSocketHandlerStateForTests();
    },
  };
}
