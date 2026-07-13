import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { GuestWeddingState } from "../../../shared/types";
import { WeddingProvider, useWedding, type WeddingSession } from "../../src/wedding/WeddingContext";
import { weddingSocket } from "../../src/wedding/weddingSocket";

const SESSION_KEY = "partyplay:wedding-participant";
const session: WeddingSession = {
  participantId: "w_vera_old",
  participantName: "Вера",
};
const guestState: GuestWeddingState = {
  phase: "FINISHED",
  questionNumber: 3,
  optionStyle: null,
  expiresAt: Date.now() + 1_000,
  participantId: session.participantId,
  participantName: session.participantName,
  hasAnswered: true,
  selectedOption: 1,
};

class MemorySessionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

async function mountGuestContext() {
  const storage = new MemorySessionStorage();
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: storage },
  });

  const originalConnect = weddingSocket.connect;
  const originalDisconnect = weddingSocket.disconnect;
  weddingSocket.connect = () => weddingSocket;
  weddingSocket.disconnect = () => weddingSocket;

  let latest: ReturnType<typeof useWedding> | null = null;
  let renderer: ReactTestRenderer | null = null;
  const Probe = () => {
    latest = useWedding();
    return null;
  };
  const serverEmit = (event: string, payload?: unknown) => {
    const args = payload === undefined ? [event] : [event, payload];
    (
      weddingSocket as unknown as {
        emitEvent: (eventArguments: unknown[]) => void;
      }
    ).emitEvent(args);
  };

  await act(async () => {
    renderer = create(
      <WeddingProvider role="guest">
        <Probe />
      </WeddingProvider>,
    );
  });

  return {
    storage,
    serverEmit,
    snapshot: () => latest,
    primeSeat: async () => {
      await act(async () => {
        serverEmit("wedding:joined", session);
        serverEmit("wedding:guestState", guestState);
        serverEmit("wedding:participants", {
          participants: [{ id: session.participantId, name: "Вера", connected: true }],
        });
      });
    },
    cleanup: async () => {
      if (renderer) await act(async () => renderer?.unmount());
      weddingSocket.connect = originalConnect;
      weddingSocket.disconnect = originalDisconnect;
      if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
      else delete (globalThis as { window?: unknown }).window;
    },
  };
}

test("contest reset clears the saved guest session and current seat", async () => {
  const mounted = await mountGuestContext();
  try {
    await mounted.primeSeat();
    assert.equal(mounted.storage.getItem(SESSION_KEY) !== null, true);
    assert.equal(mounted.snapshot()?.guestState?.participantId, session.participantId);
    assert.equal(mounted.snapshot()?.participants.length, 1);

    await act(async () => mounted.serverEmit("wedding:contestReset"));

    assert.equal(mounted.storage.getItem(SESSION_KEY), null);
    assert.equal(mounted.snapshot()?.guestState, null);
    assert.deepEqual(mounted.snapshot()?.participants, []);
  } finally {
    await mounted.cleanup();
  }
});

test("a stale rejoin error clears an offline guest's finished state", async () => {
  const mounted = await mountGuestContext();
  try {
    await mounted.primeSeat();

    await act(async () => mounted.serverEmit("wedding:error", { message: "Участник не найден" }));

    assert.equal(mounted.storage.getItem(SESSION_KEY), null);
    assert.equal(mounted.snapshot()?.guestState, null);
    assert.deepEqual(mounted.snapshot()?.participants, []);
  } finally {
    await mounted.cleanup();
  }
});
