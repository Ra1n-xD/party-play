import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { Socket } from "socket.io";
import { createNamespaceConnectionLimiter } from "../../src/namespaceConnectionLimiter.js";

function createSocket(address: string): Socket {
  const socket = new EventEmitter() as EventEmitter & { handshake: Socket["handshake"] };
  socket.handshake = {
    address,
    headers: {},
  } as Socket["handshake"];
  return socket as Socket;
}

test("shares one per-IP connection budget across namespaces", () => {
  const counts = new Map<string, number>();
  const limit = createNamespaceConnectionLimiter(1, counts);
  const first = createSocket("198.51.100.10");
  const second = createSocket("198.51.100.10");

  let firstError: Error | undefined;
  limit(first, (error) => {
    firstError = error;
  });
  assert.equal(firstError, undefined);
  assert.equal(counts.get("198.51.100.10"), 1);

  let secondError: Error | undefined;
  limit(second, (error) => {
    secondError = error;
  });
  assert.match(secondError?.message ?? "", /too many connections/i);

  first.emit("disconnect");
  assert.equal(counts.has("198.51.100.10"), false);
});

test("production limits questions without changing the existing wedding namespace", () => {
  const source = readFileSync(join(process.cwd(), "server/src/index.ts"), "utf8");
  assert.match(source, /questionsNamespace\.use\(connectionLimiter\)/);
  assert.doesNotMatch(source, /weddingNamespace\.use\(connectionLimiter\)/);
});
