import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { generateRoomCode } from "../src/utils.js";

test("generates exactly four unambiguous uppercase letters", () => {
  for (let index = 0; index < 256; index += 1) {
    assert.match(generateRoomCode(), /^[A-HJ-NP-Z]{4}$/);
  }
});

test("shares one canonical room-code contract across client and server", async () => {
  const contractUrl = new URL("../../shared/roomCode.ts", import.meta.url);
  assert.equal(existsSync(contractUrl), true, "shared room-code contract must exist");

  const contract = await import("../../shared/roomCode.ts");
  assert.equal(contract.ROOM_CODE_LENGTH, 4);
  assert.equal(contract.normalizeRoomCode(" abcd "), "ABCD");
  assert.equal(contract.normalizeRoomCode("ABC"), null);
  assert.equal(contract.normalizeRoomCode("ABCDE"), null);
  assert.equal(contract.normalizeRoomCode("AB1D"), null);
  assert.equal(contract.normalizeRoomCode("AB-Д"), null);
  assert.equal(contract.normalizeRoomCode("AIOZ"), null);
  assert.equal(contract.sanitizeRoomCodeInput("a1-bcdi"), "ABCD");
});

test("normalizes room codes before every join and rejoin lookup", () => {
  const source = readFileSync(new URL("../src/socketHandlers.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /function isValidRoomCode/);
  assert.equal((source.match(/normalizeRoomCode\(roomCode\)/g) ?? []).length, 4);
  assert.equal((source.match(/getRoom\(normalizedRoomCode\)/g) ?? []).length, 2);
  assert.equal((source.match(/joinRoom\(normalizedRoomCode/g) ?? []).length, 1);
  assert.match(source, /joinRoomAsSpectator\(\s*normalizedRoomCode,/s);
});
