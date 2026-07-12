# Resilient Reconnection and Host Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every active-game seat across disconnects, pause the authoritative game until missing seats are restored or closed, and support host-approved replacement, host failover, permanent kick, and manual host transfer.

**Architecture:** Keep rooms server-authoritative and in memory. Add composable pause reasons to `GameState`, fixed seat metadata and pending claims to `Room`, and a focused `reconnectManager` for seat ownership, claims, and host selection. Socket handlers remain the transport boundary; React context owns reconnect orchestration while small UI components render recovery and moderation flows.

**Tech Stack:** TypeScript, Node.js `node:test`, Express/Socket.IO, React 18, Vite, existing CSS design system.

## Global Constraints

- Work only on branch `fix/reconect` in `/private/tmp/party-play-fix-reconect`.
- Preserve server-authoritative game state; clients never advance phases locally.
- Pause every active phase from `CATASTROPHE_REVEAL` through `ROUND_RESULT` on human disconnect.
- Spectators and bots never create reconnect pauses.
- Do not delete or replace an active-game seat on transient disconnect.
- A stored valid session reconnects automatically; a different browser requires current-host approval.
- A host-approved replacement reuses the same player ID and character and invalidates the old credential.
- A disconnected host transfers authority to the next connected human in original order; authority never returns automatically.
- A kicked active-game seat is permanently closed and never claimable.
- Keep existing UI architecture and game rules except where reconnect normalization is required.
- Use TDD: every behavioral task begins with a failing `node:test` case.
- After every completed task, use an English Conventional Commit message.

---

## File Map

### Shared protocol

- Modify `shared/types.ts`: public pause/seat data, reconnect claim types, and new Socket.IO events.

### Server

- Modify `server/package.json`: declare the Socket.IO client test dependency.
- Modify `server/src/roomManager.ts`: fixed roster fields, closed seats, pending claims, test cleanup.
- Modify `server/src/gameEngine.ts`: composable pause reasons, action guards, timer resume, kick normalization.
- Modify `server/src/botManager.ts`: explicit bot timer cancellation and pause-aware scheduling.
- Create `server/src/reconnectManager.ts`: seat binding, disconnect state, host selection/transfer, claim lifecycle.
- Modify `server/src/socketHandlers.ts`: reconnect events, ownership-safe disconnect, moderation handlers.
- Create `server/tests/helpers/socketTestServer.ts`: ephemeral Socket.IO integration harness.
- Create `server/tests/reconnect/Reconnection.integration.test.ts`: authoritative reconnect regression suite.

### Client

- Create `client/src/context/reconnectStorage.ts`: saved session parsing and terminal cleanup.
- Modify `client/src/context/GameContext.tsx`: reconnect on every connect, claim state/events, moderation actions.
- Create `client/src/screens/ReconnectScreen.tsx`: room lookup, seat selection, waiting state.
- Modify `client/src/screens/HomeScreen.tsx`: enter the reconnect flow.
- Create `client/src/components/ReconnectPauseOverlay.tsx`: missing-player waiting UI.
- Modify `client/src/App.tsx`: reason-aware pause rendering and reconnect route.
- Create `client/src/screens/game/ReconnectHostControls.tsx`: claims, kick, and transfer controls.
- Modify `client/src/screens/game/HostControlDialog.tsx`: embed reconnect moderation.
- Modify `client/src/screens/LobbyScreen.tsx`: compact host management for disconnected lobby seats.
- Modify `client/src/screens/game/PlayerBoard.tsx`: disconnected and kicked seat labels.
- Modify `client/src/screens/game/GameRoomHeader.tsx`: safe active-game leave confirmation.
- Modify `client/src/styles/global.css` and `client/src/styles/game-screen.css`: reconnect and moderation states.
- Create `client/tests/reconnect/ReconnectFlow.test.tsx`: client behavior and source contracts.

### Scripts and documentation

- Modify `package.json`: add `test:reconnect` and aggregate verification command.
- Reference `docs/superpowers/specs/2026-07-12-resilient-reconnection-and-host-recovery-design.md` throughout implementation.

---

### Task 1: Shared reconnect protocol and integration harness

**Files:**

- Modify: `shared/types.ts`
- Modify: `server/src/roomManager.ts`
- Modify: `server/src/gameEngine.ts`
- Modify: `server/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `server/tests/helpers/socketTestServer.ts`
- Create: `server/tests/reconnect/Reconnection.integration.test.ts`

**Interfaces:**

- Produces: `PauseKind`, `ReconnectableSeat`, `SeatClaimInfo`, extended `PlayerInfo`, extended `PublicGameState`, and typed reconnect/moderation events.
- Produces: `createSocketTestServer()` returning `{ url, io, close }` for real Socket.IO clients.

- [ ] **Step 1: Add the first failing harness test**

Create a real Socket.IO server with `registerHandlers(io)`, connect one client, create a room, and assert that the harness receives the typed lobby state:

```ts
test("socket harness creates a typed lobby room", async () => {
  const server = await createSocketTestServer();
  const host = await server.connectClient();
  host.emit("room:create", { playerName: "Host" });

  const created = await host.waitFor("room:created");
  const state = await host.waitFor("game:state");

  assert.equal(created.roomCode.length, 8);
  assert.equal(state.phase, "LOBBY");
  assert.equal(state.pauseKind, "none");
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm run test:reconnect`

Expected: FAIL because `createSocketTestServer` and the shared reconnect fields do not exist.

- [ ] **Step 3: Define the shared contracts and harness**

Add these shared shapes and events:

```ts
export type PauseKind = "none" | "admin" | "reconnect" | "mixed";

export interface ReconnectableSeat {
  playerId: string;
  playerName: string;
}

export interface SeatClaimInfo {
  requestId: string;
  playerId: string;
  playerName: string;
  claimantName: string;
}
```

Extend `PlayerInfo` with `kicked: boolean`; extend `PublicGameState` with `startedPlayerCount`, `pauseKind`, and `disconnectedPlayerIds`. Add the claim, transfer, kick, host-change, and terminal reconnect-error events from the approved spec.

Add neutral room/player defaults and public serialization in `roomManager.ts` and `gameEngine.ts`: lobby state reports `pauseKind: "none"`, an empty disconnected list, and `startedPlayerCount` equal to the current lobby size until the fixed value is captured at game start.

Add:

```json
"test:reconnect": "TSX_TSCONFIG_PATH=server/tsconfig.json node --import tsx --test server/tests/reconnect/Reconnection.integration.test.ts"
```

The harness must listen on `127.0.0.1` port `0`, use `socket.io-client`, close all sockets after each test, and avoid fixed sleeps by waiting for matching events.

Declare `socket.io-client` in `server/package.json` and update `package-lock.json` with `npm install -w server -D socket.io-client@^4.8.0`.

- [ ] **Step 4: Run the harness, builds, and verify GREEN**

Run: `npm -w server run build && npm -w client run build && npm run test:reconnect`

Expected: the harness test and both builds pass. No disconnect behavior is asserted until Task 2 and Task 3.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts server/src/roomManager.ts server/src/gameEngine.ts server/package.json package.json package-lock.json server/tests/helpers/socketTestServer.ts server/tests/reconnect/Reconnection.integration.test.ts
git commit -m "test: add reconnect integration harness"
```

---

### Task 2: Composable pause engine and frozen bot actions

**Files:**

- Modify: `server/src/roomManager.ts`
- Modify: `server/src/gameEngine.ts`
- Modify: `server/src/botManager.ts`
- Test: `server/tests/reconnect/Reconnection.integration.test.ts`

**Interfaces:**

- Produces: `addDisconnectPause(room, playerId, io)`, `removeDisconnectPause(room, playerId, io)`, `setAdminPause(room, paused, io)`, `isGameplayPaused(room)`, and `resumeGameIfReady(room, io)`.
- Produces: `clearBotActions(roomCode)`.

- [ ] **Step 1: Add failing pause tests**

Exercise the exported pause helpers directly against a started room so transport wiring can remain Task 3. Cover timer preservation, two simultaneous missing-player reasons, admin plus reconnect pause, and a bot that must not reveal or vote while paused:

```ts
assert.equal(firstPause.phaseRemainingMs, null);
assert.equal(firstPause.pauseKind, "reconnect");
assert.equal(afterOneReturn.paused, true);
assert.equal(afterAllReturn.paused, false);
assert.ok(resumedRemainingMs <= beforeDisconnectRemainingMs);
assert.ok(resumedRemainingMs > beforeDisconnectRemainingMs - 500);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm run test:reconnect -- --test-name-pattern="pause|bot"`

Expected: FAIL because pause reasons and bot cancellation do not exist.

- [ ] **Step 3: Implement pause reasons at the engine boundary**

Extend `GameState`:

```ts
pauseReasons: {
  admin: boolean;
  disconnectedPlayerIds: Set<string>;
}
```

Capture the timer only on the first reason, clear it once, and resume only after both reasons clear. Replace the current boolean-only `pauseGame`/`unpauseGame` behavior with idempotent wrappers around the shared reason state.

Gameplay entry points `revealAttribute`, `revealActionCard`, `castVote`, `skipDiscussion`, and phase-changing callbacks must return without mutation while paused. Export and call `clearBotActions`; on resume call `scheduleBotActions` for the current phase.

- [ ] **Step 4: Run focused and existing tests**

Run: `npm run test:reconnect && npm run test:game-screen && npm -w server run build`

Expected: all added pause tests pass; existing GameScreen tests remain green.

- [ ] **Step 5: Commit**

```bash
git add server/src/roomManager.ts server/src/gameEngine.ts server/src/botManager.ts server/tests/reconnect/Reconnection.integration.test.ts
git commit -m "feat: pause games for reconnect reasons"
```

---

### Task 3: Reserved seats and race-safe automatic reconnect

**Files:**

- Create: `server/src/reconnectManager.ts`
- Modify: `server/src/roomManager.ts`
- Modify: `server/src/socketHandlers.ts`
- Test: `server/tests/reconnect/Reconnection.integration.test.ts`

**Interfaces:**

- Produces: `markPlayerDisconnected`, `bindPlayerSocket`, `cancelClaimsForPlayer`, `removeClaimsForSocket`, and `isCurrentSocketOwner`.
- Consumes: pause helpers from Task 2.

- [ ] **Step 1: Add failing ownership and rejoin tests**

Test every active phase, explicit in-game leave, stored-token reconnect, duplicate reconnect, stale old-socket disconnect, and terminal invalid-session errors.

```ts
const rejoined = await reconnectWithStoredCredential(game.players[2]);
assert.equal(rejoined.playerId, originalPlayerId);
assert.deepEqual(rejoined.character, originalCharacter);
assert.equal(game.latestState.players.length, 4);

oldSocket.disconnect();
await assertStateRemains(
  (state) => state.players.find((player) => player.id === originalPlayerId)?.connected === true,
);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm run test:reconnect -- --test-name-pattern="rejoin|ownership|leave"`

Expected: FAIL because active seats are still deleted after grace expiry and reconnect rotates credentials.

- [ ] **Step 3: Implement seat reservation and atomic binding**

Add `kicked: false`, `startedPlayerCount`, and `pendingSeatClaims` defaults in room creation. Set `startedPlayerCount` in `startGame`.

`bindPlayerSocket` must:

```ts
if (player.kicked) return { ok: false, error: "Место закрыто" };
if (player.connected && player.socketId !== socketId) {
  return { ok: false, error: "Место уже подключено" };
}
player.socketId = socketId;
player.connected = true;
```

Do not rotate the credential on ordinary reconnect. Before marking a disconnect, require `player.socketId === socket.id`. Active-game disconnect and explicit leave reserve the seat indefinitely; lobby explicit leave still removes it. Remove the old five-minute active-seat deletion path.

- [ ] **Step 4: Run reconnect suite and builds**

Run: `npm run test:reconnect && npm run build`

Expected: automatic reconnect, stale socket, and fixed-seat tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/reconnectManager.ts server/src/roomManager.ts server/src/socketHandlers.ts server/tests/reconnect/Reconnection.integration.test.ts
git commit -m "fix: preserve seats across reconnects"
```

---

### Task 4: Automatic and manual host transfer

**Files:**

- Modify: `server/src/reconnectManager.ts`
- Modify: `server/src/socketHandlers.ts`
- Modify: `shared/types.ts`
- Test: `server/tests/reconnect/Reconnection.integration.test.ts`

**Interfaces:**

- Produces: `ensureConnectedHost(room, io, formerHostId?)` and `transferHost(room, actorId, targetId, io)`.
- Produces event: `room:hostChanged` with `{ hostId, hostName, reason }`.

- [ ] **Step 1: Add failing host tests**

Cover deterministic original-order failover, eliminated-human eligibility, no connected humans, first-human recovery, former host returning without reclaiming authority, invalid target, and manual transfer.

```ts
host.disconnect();
const changed = await nextHuman.waitFor("room:hostChanged");
assert.equal(changed.reason, "disconnect");

await reconnectOriginalHost();
assert.equal(latestState.players.find((p) => p.id === originalHostId)?.isHost, false);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm run test:reconnect -- --test-name-pattern="host"`

Expected: FAIL because host ID currently remains on the disconnected seat.

- [ ] **Step 3: Implement host selection and transfer**

Eligible targets are connected, human, and not kicked; alive state is irrelevant. Search cyclically through `allPlayerIds` after the former host. If none exists, keep the room paused and evaluate again on each human reconnect.

Manual transfer validates current host and target. Both automatic and manual transfer clear the abandoned admin-panel pause reason while retaining reconnect reasons, broadcast state, emit `room:hostChanged`, and send current pending claims to the successor.

- [ ] **Step 4: Run suite and verify no authority regressions**

Run: `npm run test:reconnect && npm -w server run build`

Expected: every host test passes and former host actions are rejected.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts server/src/reconnectManager.ts server/src/socketHandlers.ts server/tests/reconnect/Reconnection.integration.test.ts
git commit -m "feat: transfer host authority on disconnect"
```

---

### Task 5: Host-approved cross-browser claims

**Files:**

- Modify: `server/src/reconnectManager.ts`
- Modify: `server/src/socketHandlers.ts`
- Modify: `shared/types.ts`
- Test: `server/tests/reconnect/Reconnection.integration.test.ts`

**Interfaces:**

- Produces: `listReconnectableSeats`, `createSeatClaim`, `resolveSeatClaim`, `expireSeatClaims`, and `emitClaimsToHost`.
- Consumes: atomic seat binding from Task 3 and host authority from Task 4.

- [ ] **Step 1: Add failing claim and privacy tests**

Test filtered seat listing, requester waiting without room membership, approve/reject, two-minute expiry, competing requests, original-owner priority, claimant disconnect, replacement credential rotation, and old credential rejection.

```ts
claimant.emit("room:requestSeatClaim", request);
await claimant.waitFor("room:seatClaimSubmitted");
assert.equal(claimant.receivedGameState, false);
assert.equal(claimant.receivedCharacter, false);

host.emit("admin:resolveSeatClaim", { requestId, approved: true });
assert.equal((await claimant.waitFor("room:joined")).playerId, disconnectedId);
assert.deepEqual(await claimant.waitFor("game:character"), originalCharacter);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm run test:reconnect -- --test-name-pattern="claim|replacement|privacy"`

Expected: FAIL because claim events and pending claim storage do not exist.

- [ ] **Step 3: Implement the claim lifecycle**

Claims use cryptographically random IDs, expire after 120 seconds, and never join the requester to the room before approval. Only the current host receives `admin:seatClaimsUpdated`.

Approval sanitizes and applies `claimantName`, rotates `sessionToken`, atomically binds the socket, emits `room:joined`, sends the private character, cancels competing claims, and removes the reconnect pause reason. Reject and cancellation return a terminal message without leaking game state.

- [ ] **Step 4: Run security and regression tests**

Run: `npm run test:reconnect && npm run build`

Expected: claim lifecycle and privacy tests pass; existing builds remain green.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts server/src/reconnectManager.ts server/src/socketHandlers.ts server/tests/reconnect/Reconnection.integration.test.ts
git commit -m "feat: add host-approved seat recovery"
```

---

### Task 6: Permanent kick and phase normalization

**Files:**

- Modify: `server/src/gameEngine.ts`
- Modify: `server/src/reconnectManager.ts`
- Modify: `server/src/socketHandlers.ts`
- Modify: `shared/types.ts`
- Test: `server/tests/reconnect/Reconnection.integration.test.ts`

**Interfaces:**

- Produces: `kickPlayerPermanently(room, actorId, playerId, io)`.

- [ ] **Step 1: Add failing kick tests**

Cover current/future reveal turn, discussion, regular vote, tiebreak, result, already eliminated player, former disconnected host, self-kick rejection, closed-seat listing, and capacity-based game end.

```ts
host.emit("admin:kickPlayer", { targetPlayerId: futureTurnId });
const normalized = await host.waitForState(
  (state) => state.players.find((p) => p.id === futureTurnId)?.kicked === true,
);
assert.notEqual(normalized.currentTurnPlayerId, futureTurnId);
assert.equal(normalized.players.length, normalized.startedPlayerCount);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm run test:reconnect -- --test-name-pattern="kick|closed|capacity"`

Expected: FAIL because active-game human kick and `kicked` public state are missing.

- [ ] **Step 3: Implement atomic closed-seat normalization**

Invalidate credentials, disconnect current ownership, cancel claims, mark `kicked`, close reconnect pause, remove the seat from host eligibility and turn order, and repair indices.

During voting, the kick consumes the current ballot: clear the ballot and advance through the normal result/remaining-vote flow with the kicked player as the administrative result. End immediately when alive players are at or below bunker capacity. Never delete the historical active-game record.

- [ ] **Step 4: Run full server suite**

Run: `npm run test:reconnect && npm -w server run build`

Expected: every phase-normalization test passes with no stuck turn IDs or impossible voter counts.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts server/src/gameEngine.ts server/src/reconnectManager.ts server/src/socketHandlers.ts server/tests/reconnect/Reconnection.integration.test.ts
git commit -m "fix: normalize games after permanent kicks"
```

---

### Task 7: Client reconnect orchestration and session state

**Files:**

- Create: `client/src/context/reconnectStorage.ts`
- Modify: `client/src/context/GameContext.tsx`
- Create: `client/tests/reconnect/ReconnectFlow.test.tsx`
- Modify: `package.json`

**Interfaces:**

- Produces context fields: `reconnectState`, `reconnectableSeats`, `pendingSeatClaim`, `hostSeatClaims`, and `hostChangeNotice`.
- Produces actions: `listReconnectableSeats`, `requestSeatClaim`, `cancelSeatClaim`, `resolveSeatClaim`, `kickPlayer`, `transferHost`, and `clearHostChangeNotice`.

- [ ] **Step 1: Add failing client orchestration tests**

Assert the context registers one persistent `connect` handler that re-emits stored rejoin on every connection, retains game state during transient disconnect, clears storage only on terminal reconnect error, and updates claim/host state from typed events.

```ts
assert.match(source, /socket\.on\("connect", handleConnect\)/);
assert.match(source, /handleConnect[\s\S]*attemptStoredRejoin/);
assert.doesNotMatch(source, /socket\.on\("disconnect"[^]*setGameState\(null\)/);
```

- [ ] **Step 2: Run client test and confirm RED**

Run: `npm run test:reconnect-client`

Expected: FAIL because the storage helper and reconnect state do not exist.

- [ ] **Step 3: Implement context orchestration**

Centralize local credential reads/writes in `reconnectStorage.ts`. On every `connect`, attempt stored rejoin when credentials exist. Preserve current state on `disconnect` and expose reconnecting status. Handle all claim, host-change, terminal error, kick, and transfer events with cleanup in the effect teardown.

Add:

```json
"test:reconnect-client": "TSX_TSCONFIG_PATH=client/tsconfig.json node --import tsx --test client/tests/reconnect/ReconnectFlow.test.tsx"
```

- [ ] **Step 4: Run client and server regression suites**

Run: `npm run test:reconnect-client && npm run test:reconnect && npm run test:game-screen`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/context/reconnectStorage.ts client/src/context/GameContext.tsx client/tests/reconnect/ReconnectFlow.test.tsx package.json
git commit -m "feat(client): orchestrate resilient reconnects"
```

---

### Task 8: Recovery, pause, and host moderation UI

**Files:**

- Create: `client/src/screens/ReconnectScreen.tsx`
- Modify: `client/src/screens/HomeScreen.tsx`
- Create: `client/src/components/ReconnectPauseOverlay.tsx`
- Modify: `client/src/App.tsx`
- Create: `client/src/screens/game/ReconnectHostControls.tsx`
- Modify: `client/src/screens/game/HostControlDialog.tsx`
- Modify: `client/src/screens/LobbyScreen.tsx`
- Modify: `client/src/screens/game/PlayerBoard.tsx`
- Modify: `client/src/screens/game/GameRoomHeader.tsx`
- Modify: `client/src/styles/global.css`
- Modify: `client/src/styles/game-screen.css`
- Test: `client/tests/reconnect/ReconnectFlow.test.tsx`
- Test: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: context reconnect/moderation fields from Task 7.

- [ ] **Step 1: Add failing component and accessibility tests**

Render and assert:

- Home exposes `Вернуться в игру`;
- requester moves lookup -> seat selection -> waiting;
- ordinary player sees missing names in blocking overlay;
- host bypasses the overlay and sees claims;
- lobby host can approve, reject, kick, and transfer;
- new host notification is visible;
- kicked player card reads `Удалён администратором`;
- active-game leave requires confirmation and retains recovery credentials;
- mobile controls remain at least 44px.

- [ ] **Step 2: Run client tests and confirm RED**

Run: `npm run test:reconnect-client && npm run test:game-screen`

Expected: FAIL with missing reconnect UI and moderation controls.

- [ ] **Step 3: Implement the recovery and pause UI**

Keep all new surfaces in the existing graphite/amber/green palette. The requester never renders `GameScreen` before approval. `ReconnectPauseOverlay` blocks non-host players and spectators but returns `null` for the current host. Embed one reusable `ReconnectHostControls` in both the game admin dialog and compact lobby management modal.

Host transfer closes the old host dialog; the new host receives `Вам переданы права хоста`. The disconnected former host returns as a normal player unless authority is manually transferred back.

- [ ] **Step 4: Run UI tests, formatting, and build**

Run: `npm run test:reconnect-client && npm run test:game-screen && npm run test:theme && npm -w client run build && npm run format:check`

Expected: all targeted tests and build pass; formatting reports no changed-file violations.

- [ ] **Step 5: Commit**

```bash
git add client/src client/tests/reconnect client/tests/game-screen package.json
git commit -m "feat(client): add reconnect recovery controls"
```

---

### Task 9: Full verification and browser multiplayer QA

**Files:**

- Modify only if a reproduced defect requires a focused fix and regression test.

**Interfaces:**

- Consumes the complete server and client reconnect flow.

- [ ] **Step 1: Run the complete automated verification**

Run:

```bash
npm run test:reconnect
npm run test:reconnect-client
npm run test:game-screen
npm run test:theme
npm -w server run build
npm -w client run build
npm run format:check
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 2: Run real multiplayer browser QA**

Use one visible browser client plus additional Socket.IO clients to verify disconnect/reconnect in reveal, discussion, vote, and result phases. Verify timer freeze, no bot activity, same player ID and private character, host failover, manual transfer, cross-browser approval, rejection, kick, closed seat, and final results.

- [ ] **Step 3: Verify mobile behavior**

At `390 x 844`, verify Home recovery, waiting state, reconnect overlay, host moderation, player tabs, and bottom actions without horizontal overflow or inaccessible controls.

- [ ] **Step 4: Request independent code review**

Ask reviewers to audit server invariants, socket security, client privacy, and phase normalization. Fix every Critical or Important finding with a failing regression test first.

- [ ] **Step 5: Run final fresh verification and commit any review fixes**

Use the exact commands from Step 1 after the final code change.

If review fixes were required:

```bash
git add shared/types.ts server/src server/tests client/src client/tests package.json package-lock.json
git commit -m "fix: harden reconnect edge cases"
```
