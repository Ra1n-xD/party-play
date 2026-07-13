import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { GuestWeddingState } from "../../../shared/types";
import { WeddingProvider, useWedding, type WeddingSession } from "../../src/wedding/WeddingContext";
import { weddingSocket } from "../../src/wedding/weddingSocket";

const SESSION_KEY = "partyplay:wedding-participant";

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

test("contest reset clears the saved guest session and current seat", async () => {
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

  try {
    await act(async () => {
      renderer = create(
        <WeddingProvider role="guest">
          <Probe />
        </WeddingProvider>,
      );
    });
    await act(async () => {
      serverEmit("wedding:joined", session);
      serverEmit("wedding:guestState", guestState);
      serverEmit("wedding:participants", {
        participants: [{ id: session.participantId, name: "Вера", connected: true }],
      });
    });

    assert.equal(storage.getItem(SESSION_KEY) !== null, true);
    assert.equal(latest?.guestState?.participantId, session.participantId);
    assert.equal(latest?.participants.length, 1);

    await act(async () => serverEmit("wedding:contestReset"));

    assert.equal(storage.getItem(SESSION_KEY), null);
    assert.equal(latest?.guestState, null);
    assert.deepEqual(latest?.participants, []);
  } finally {
    if (renderer) await act(async () => renderer?.unmount());
    weddingSocket.connect = originalConnect;
    weddingSocket.disconnect = originalDisconnect;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else delete (globalThis as { window?: unknown }).window;
  }
});
