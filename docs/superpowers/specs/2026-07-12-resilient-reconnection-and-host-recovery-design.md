# Resilient Reconnection and Host Recovery Design

Date: 2026-07-12

Status: Approved in conversation; awaiting written-spec review

## Summary

PartyPlay must preserve an in-progress Bunker game when a human player loses their connection. A disconnected player keeps the same seat, character, revealed information, vote state, and turn position. Every active game phase pauses immediately and resumes from the same point only after every missing seat is either restored through automatic reconnection, filled through host approval, or permanently closed by the host.

The current host remains able to open administrative controls while the game is paused. If the host disconnects, authority moves deterministically to another connected human player and does not automatically return when the former host reconnects. The host can also transfer authority manually.

## Goals

- Pause every active game phase when a human player disconnects.
- Preserve player count and seat identity across temporary disconnects.
- Automatically restore the same browser through its saved session credential.
- Allow a different browser or person to request an existing disconnected seat.
- Require the current host to approve or reject every cross-browser seat claim.
- Transfer host authority automatically when the host disconnects.
- Allow manual host transfer to another connected human player.
- Keep host moderation available during reconnect pauses.
- Let the host permanently kick a player and close that seat for the rest of the game.
- Make reconnect, socket replacement, pause, and resume operations idempotent.
- Protect private character data until a seat claim is approved.
- Cover the behavior with server integration tests, client tests, and browser QA.

## Non-goals

- Persisting rooms across a server restart or process crash.
- Allowing brand-new seats after a game has started.
- Reopening a seat that the host permanently closed.
- Automatically deciding whether a claimant is the same real-world person.
- Pausing the game for spectators or bots.
- Returning host authority automatically to a former host.
- Replacing the existing in-memory room architecture with a database.

## Terminology

- **Seat:** the existing `Player` record created before the game starts. A seat owns the player ID, character, reveal history, vote state, and position in the original order.
- **Automatic reconnect:** a browser proves ownership with the session credential already stored locally.
- **Seat claim:** an unauthenticated browser asks the host to bind it to one disconnected seat.
- **Replacement:** a host-approved claimant takes ownership of an existing seat and inherits its character and game history.
- **Closed seat:** a seat permanently kicked by the host. It remains in game history but can never reconnect or be claimed.
- **Reconnect pause:** a pause caused by one or more disconnected human seats.
- **Admin pause:** a pause caused by the host opening administrative controls.

## Seat Lifecycle

An active-game seat has one of three effective states:

1. **Connected** — one current socket owns the seat.
2. **Disconnected** — the seat remains intact and is eligible for automatic reconnect or a host-approved claim.
3. **Closed** — the host permanently kicked the seat; it remains visible in history but is never eligible for reconnection or replacement.

The implementation should preserve the existing `Player` structure and add an explicit `kicked` flag rather than removing active-game player records. `connected` and `kicked` must never both be true.

Before a game starts, a host kick may remove a player record because the fixed roster has not been established. Once the game starts, `startedPlayerCount` is fixed and kicked seats remain as closed historical records.

## Server State

### Player

Extend `Player` with:

```ts
kicked: boolean;
```

The existing `socketId`, `sessionToken`, and `connected` fields remain the source of truth for current socket ownership.

### Room

Extend `Room` with:

```ts
startedPlayerCount: number | null;
pendingSeatClaims: Map<string, PendingSeatClaim>;
```

`startedPlayerCount` is set exactly once when the game starts. It is not decremented by disconnects or kicks.

```ts
interface PendingSeatClaim {
  id: string;
  socketId: string;
  playerId: string;
  claimantName: string;
  createdAt: number;
  expiresAt: number;
}
```

Claims are room-scoped but the requester does not join the Socket.IO room and receives no game state until approval.

### Game pause state

Replace the single undifferentiated pause condition with composable reasons:

```ts
interface PauseReasons {
  admin: boolean;
  disconnectedPlayerIds: Set<string>;
}
```

The public `paused` value is derived from `admin || disconnectedPlayerIds.size > 0`. Public state also exposes the pause kind and missing player IDs so the client can render an accurate waiting screen.

The existing remaining-time snapshot and transition callback are captured only when the game changes from unpaused to paused. Additional pause reasons do not overwrite the snapshot. The timer resumes only when the final pause reason is removed.

## Automatic Reconnection

The client must attempt stored-session reconnection on every Socket.IO `connect` event, not only during the first React mount.

The automatic flow is:

1. The socket connects or reconnects.
2. The client reads the saved room, player, role, and session credential.
3. The client emits `room:rejoin` or `room:rejoinSpectator`.
4. The server validates the credential and verifies that the seat is not closed.
5. The server verifies that the seat is currently disconnected, then atomically binds the new socket to it.
6. The server sends `room:joined`, the private character when applicable, and the current public state.
7. The server cancels every pending claim for that seat.
8. The server removes the seat from the reconnect pause set.
9. The game resumes only if no other pause reason remains.

An ordinary automatic reconnect keeps a stable seat credential. This avoids StrictMode/double-connect races in which one successful reconnect rotates the token before an immediately repeated reconnect request arrives.

An automatic reconnect cannot take over a seat that is already connected. If two sockets race for one disconnected seat with the same valid credential, the first successful atomic bind wins and the other request receives `Место уже подключено`.

A host-approved replacement rotates the credential. This permanently invalidates the old browser after ownership is transferred.

Socket ownership changes must be race-safe:

- remove the old socket-to-room mapping before binding the new socket;
- disconnect or invalidate an old still-connected socket;
- in every disconnect handler, verify `player.socketId === socket.id` before changing the player's connection state;
- ignore late disconnect events from sockets that no longer own the seat.

Automatic reconnect has priority over pending host approval. If the credential owner returns first, all pending claims for that seat are rejected with a clear reason.

## Cross-browser Seat Claim

The Home screen adds a `Вернуться в игру` flow:

1. The requester enters a room code.
2. The client asks for reconnectable seats.
3. The server returns only disconnected, non-bot, non-closed seats.
4. The requester chooses a seat, enters their display name, and submits a claim.
5. The requester sees a waiting screen and receives no room state or private character.
6. The current host receives the claim in the admin panel.
7. The host approves or rejects it.

Recommended event contract:

```ts
// Client -> server
"room:listReconnectableSeats": (data: { roomCode: string }) => void;
"room:requestSeatClaim": (data: {
  roomCode: string;
  playerId: string;
  claimantName: string;
}) => void;
"room:cancelSeatClaim": (data: { requestId: string }) => void;
"admin:resolveSeatClaim": (data: {
  requestId: string;
  approved: boolean;
}) => void;

// Server -> client
"room:reconnectableSeats": (data: {
  roomCode: string;
  seats: Array<{ playerId: string; playerName: string }>;
}) => void;
"room:seatClaimSubmitted": (data: { requestId: string }) => void;
"room:seatClaimResolved": (data: {
  requestId: string;
  approved: boolean;
  message: string;
}) => void;
"admin:seatClaimsUpdated": (data: {
  claims: Array<{
    requestId: string;
    playerId: string;
    playerName: string;
    claimantName: string;
  }>;
}) => void;
```

Only the current host receives pending-claim details. When host authority changes, the full pending list is immediately sent to the new host.

On approval, the server reuses the existing player ID and `Player` object, changes the displayed name to the claimant's approved name, binds the claimant socket, rotates the session credential, joins the socket to the room, sends private character data, and resolves all competing claims for that seat.

Only one claim may win a seat. Claims expire after two minutes, are rate-limited, and are cancelled when the requester disconnects, the original credential owner returns, another claim wins, the host closes the seat, or the room ends. Stale claim IDs are rejected idempotently.

## Disconnect and Pause Behavior

### Active game phases

For every phase from `CATASTROPHE_REVEAL` through `ROUND_RESULT`, a human disconnect immediately:

- sets `connected = false` without deleting the seat;
- adds the player ID to `disconnectedPlayerIds`;
- pauses the active phase timer at its exact remaining duration;
- stops pending bot timers;
- preserves turn order, votes, reveal state, and current phase;
- broadcasts the paused state;
- triggers host failover when the disconnected player was the host.

No automatic reveal, vote, phase transition, or five-minute deletion occurs during an active game. The game waits indefinitely until the seat owner reconnects automatically or the host approves a replacement or closes the seat.

Server-side gameplay functions, not only client overlays, must reject player actions while paused. Bot callbacks also check pause state. When the final pause reason clears, the server restores the phase timer and reschedules bot actions for the current phase.

### Lobby

The lobby has no running phase timer, so it does not show the full-screen game pause. A disconnected lobby seat remains reserved, is eligible for the same automatic reconnect or host-approved claim flow, and prevents game start until it reconnects, is replaced, or is kicked. Host failover and manual host transfer still apply in the lobby. A compact lobby host-management modal exposes pending claims, human-player kick, and host transfer without exposing in-game character or bunker administration.

### Game over and spectators

Disconnects after `GAME_OVER` do not pause the game. Spectator disconnects never pause the game and do not participate in host selection.

### Explicit leave

Before game start, explicit leave removes the lobby player normally and clears its local credential. During an active game, explicit leave behaves like a network disconnect: the seat remains reserved, the stored credential is retained, and the game pauses. The UI warns the player that the room will wait until they return, are replaced, or are removed by the host. Permanent departure from an active seat is completed only by a host kick.

## Host Failover

When the current host disconnects or becomes ineligible:

1. Pause the game for the missing host seat.
2. Search `allPlayerIds` cyclically after the former host.
3. Select the first connected, non-bot, non-closed human player.
4. Set `room.hostId` to that player.
5. Broadcast the updated `isHost` flags and a host-change notification.
6. Send pending seat claims to the new host.

Alive and eliminated human players are both eligible because host authority is administrative rather than a survival reward.

If no eligible human is connected, the game remains paused without an active administrator. When a human seat reconnects, host eligibility is evaluated again. If the former host returns first while `room.hostId` was never changed, they remain host. Once authority has moved to another player, it never returns automatically.

The admin panel adds manual host transfer. The current host may transfer authority only to a connected, non-bot, non-closed human player. The server validates authority and target eligibility atomically. A host cannot kick themselves; they must transfer authority first. A successor host may kick the disconnected former host.

An admin-panel pause reason belongs to the panel session, not permanently to a player. Automatic or manual host transfer clears the old panel's admin pause reason before changing `hostId`; reconnect pause reasons remain. The old host immediately loses administrative access. The new host receives a prominent notification and can open the panel while the game remains paused.

## Host Administration During Reconnect Pause

The global pause overlay stays blocking for ordinary players and spectators. It lists the missing players and explains that the room is waiting for reconnection or host action.

The current host does not receive the blocking overlay and can access:

- pending seat claims with approve and reject controls;
- permanently kicking a player and closing the seat;
- transferring host authority;
- existing character and bunker administration;
- ending the game.

Existing phase restrictions on non-moderation admin operations remain. Reconnect moderation, kick, host transfer, and end-game operations remain available while paused, including during voting.

## Permanent Kick and Closed Seats

During an active game, a host kick does not delete the historical `Player` record. It performs one atomic normalization operation:

- invalidate the session credential;
- disconnect and unmap any socket that still owns the seat;
- cancel every pending claim for the seat;
- set `kicked = true`, `connected = false`, and `alive = false`;
- remove the player ID from reconnect pause reasons;
- remove the player from host eligibility;
- remove or advance past the player in `turnOrder` without skipping another player;
- remove every incoming and outgoing vote record involving the player;
- exclude the player from total expected voters and tiebreak candidates;
- repair `lastEliminatedId` when necessary;
- run the normal bunker-capacity end condition;
- resume only when no pause reason remains.

The seat remains visible as `Удалён администратором` in player lists and final results. It is never returned by the reconnectable-seats endpoint and cannot be reopened during the current game.

If the kick reduces alive players to `bunkerCapacity` or fewer, the game ends immediately rather than performing an extra scheduled elimination.

If a player is kicked during `ROUND_VOTE` or `ROUND_VOTE_TIEBREAK`, the kick consumes the current ballot's elimination: the current ballot is cancelled, its votes are cleared, and the engine advances through the normal result/remaining-votings flow with the kicked player as the administrative result. This prevents a kick and the interrupted ballot from eliminating two players for one scheduled voting slot.

## Client Experience

### Reconnecting owner

While the socket is reconnecting, retain the current game UI state and show a reconnecting status rather than routing immediately to Home. Clear stored credentials only after an authoritative response that the room no longer exists, the seat is closed, or the credential is invalid.

### Seat claimant

The claimant sees only:

- room code;
- chosen original seat name;
- submitted claimant name;
- waiting, approved, rejected, or cancelled status.

No game state or private character data is delivered before approval.

### Paused players

The reconnect pause overlay shows:

- `Пауза — ждём переподключение`;
- missing player names and count;
- connection status;
- a note that only the host can replace or remove a missing player.

### Current host

The host sees the underlying game screen, a prominent missing-player banner, the existing admin entry point, pending claims, kick controls, and host-transfer controls.

In the lobby, the host receives the same reconnect moderation, kick, and host-transfer controls in a smaller room-management modal.

### Host change

The new host receives a toast or announcement: `Вам переданы права хоста`. The former host sees an ordinary paused-player view after reconnect unless authority is manually returned.

## Error Handling and Security

- Validate and sanitize room codes, player IDs, claimant names, request IDs, and target IDs.
- Rate-limit seat listing, claim submission, and claim resolution.
- Do not expose session credentials or private characters in public state.
- Do not accept a claim for a connected, bot, closed, or nonexistent seat.
- Do not accept automatic credential rejoin for an already connected seat.
- Do not accept host decisions from a stale or former host socket.
- Resolve duplicate and stale operations idempotently.
- Reject old credentials after a host-approved replacement.
- Guard every disconnect with current socket ownership.
- Cancel request records when their requester disconnects.
- On server restart or missing room, return a terminal reconnect error; the client clears stale credentials and routes Home.
- Keep the current in-memory room TTL behavior for empty or inactive rooms, but do not use reconnect grace expiry to delete active-game seats.

## Compatibility With Existing Game Logic

- `bunkerCapacity` and `votingSchedule` remain based on the roster at game start.
- Temporary disconnects do not change `players.size`, `startedPlayerCount`, alive state, or voting eligibility.
- Approved replacements reuse the existing seat and therefore do not change game balance.
- Permanent kick is treated as an administrative elimination and runs the existing end condition.
- Round, phase, revealed bunker cards, threat card, character data, and elimination history remain server-authoritative.
- Existing spectator behavior remains unchanged.

## Testing Strategy

### Server unit and integration tests

Add `node:test` coverage for:

- disconnect and automatic reconnect in every active phase;
- exact timer preservation and resume;
- multiple simultaneous disconnected players;
- no resume until the final pause reason clears;
- ordinary game actions rejected while paused;
- bot timers cancelled and rescheduled;
- current and future reveal-turn players disconnecting;
- vote state preserved across reconnect;
- same-browser idempotent reconnect;
- stale socket disconnect ignored after rebinding;
- automatic reconnect cancelling pending claims;
- seat list filtering;
- claim submit, reject, approve, expiry, and duplicate resolution;
- competing claims for one seat;
- replacement token rotation and old-token rejection;
- automatic host failover in original order;
- host failover when the former host is eliminated;
- no eligible connected host and first-human recovery;
- no automatic authority return;
- valid and invalid manual host transfer;
- kick during reveal, discussion, vote, result, and reconnect pause;
- kicked seat never becoming claimable;
- fixed `startedPlayerCount` and unchanged bunker capacity;
- immediate game end when kick reaches bunker capacity;
- private character delivery only after approved ownership.

### Client tests

Cover:

- reconnect emitted on every Socket.IO `connect`;
- reconnecting state retains the current screen;
- Home reconnect flow and disconnected seat selection;
- claimant waiting, approved, rejected, and cancelled states;
- reconnect pause copy and missing-player list;
- host bypass of the blocking pause overlay;
- pending claims in host controls;
- approve, reject, kick, and host-transfer controls;
- former host losing controls immediately;
- new host notification and admin availability;
- inaccessible gameplay actions while paused.

### Browser QA

Run a real multi-client smoke test with browser UI plus additional Socket.IO clients:

1. Start a room with humans and bots.
2. Disconnect a non-host in reveal, discussion, and vote phases.
3. Verify frozen timers, votes, turns, and bot actions.
4. Restore the original browser automatically.
5. Submit and approve a replacement from another browser.
6. Disconnect the host and verify authority transfer.
7. Manually transfer host authority.
8. Kick a missing player and verify the seat is closed.
9. Finish the game and inspect results and console logs.
10. Repeat essential controls at a 390 x 844 mobile viewport.

## Acceptance Criteria

- No human disconnect during an active game can advance or corrupt the game state.
- The game remains paused indefinitely until every missing seat is restored or closed.
- A returning stored session restores the exact player without host action.
- A different browser receives no game data until host approval.
- At most one active socket owns a seat.
- Starting roster size and seat count do not change on temporary disconnect.
- Closed seats can never be claimed.
- Host authority always belongs to an eligible connected human when one exists.
- Former hosts do not regain authority automatically.
- The current host can moderate reconnects, kick, transfer authority, and end the game while paused.
- Timers and bot actions resume exactly once after the final pause reason clears.
- All client and server builds and new regression tests pass.
