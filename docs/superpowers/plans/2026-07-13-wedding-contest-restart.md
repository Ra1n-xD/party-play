# Wedding Contest Restart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset a finished wedding contest by deleting every participant and requiring guests to join again, while preserving the four-day room.

**Architecture:** Keep the existing host-only `wedding:restartContest` command, but make the domain transition replace the participant list with an empty list. Add a typed `wedding:contestReset` broadcast so connected guest clients clear stale session storage and return to the existing join screen; the host keeps the room and returns to question 01 preparation.

**Tech Stack:** TypeScript, Socket.IO, React 18, Node test runner, react-test-renderer

## Global Constraints

- Work directly on branch `main`.
- Preserve `createdAt`, `expiresAt`, and the existing room.
- Delete all participant IDs, names, scores, answers, and socket bindings when a new contest starts.
- Preserve finished results until the host explicitly confirms `Начать новый конкурс`.
- Allow restart only from `FINISHED`.
- Use Russian UI and error copy.

---

### Task 1: Server reset and stale-binding invalidation

**Files:**

- Modify: `shared/types.ts`
- Modify: `server/src/wedding/weddingRoom.ts`
- Modify: `server/src/wedding/socketHandlers.ts`
- Test: `server/tests/wedding/weddingRoom.test.ts`
- Test: `server/tests/wedding/Wedding.integration.test.ts`

**Interfaces:**

- Produces: `WeddingServerEvents["wedding:contestReset"]: () => void`
- Changes: `WeddingRoomService.restartContest(): HostWeddingState` returns `PREPARING` with `participants: []`

- [ ] **Step 1: Change domain and integration expectations to the new behavior**

```ts
const oldId = vera.participantId;
const expiresAt = service.getHostState()!.expiresAt;
service.finishContest();
const restarted = service.restartContest();
assert.equal(restarted.phase, "PREPARING");
assert.equal(restarted.questionNumber, 0);
assert.deepEqual(restarted.answers, []);
assert.deepEqual(restarted.participants, []);
assert.equal(restarted.expiresAt, expiresAt);
assert.equal(service.getGuestState(oldId), null);
```

The integration test must wait for `wedding:contestReset`, assert the old socket receives an error when it attempts to answer, then call `wedding:joinNew` with the previous name and assert the returned participant ID differs from the old ID.

- [ ] **Step 2: Run focused server tests and verify RED**

Run: `npm run test:wedding-server`

Expected: failure because participants and socket bindings are still preserved and `wedding:contestReset` is not emitted.

- [ ] **Step 3: Implement the atomic participant deletion and reset broadcast**

```ts
restartContest(): HostWeddingState {
  const room = this.requireRoom();
  if (room.phase !== "FINISHED") throw new Error("Сначала завершите текущий конкурс");
  return this.mutate((draft) => {
    draft.phase = "PREPARING";
    draft.questionNumber = 0;
    draft.optionStyle = "letters";
    draft.correctOption = null;
    draft.answers = [];
    draft.participants = [];
    return this.serializeHost(draft);
  });
}
```

After a successful restart, call `participantBySocket.clear()`, emit `wedding:contestReset`, and call `broadcastAll()`.

- [ ] **Step 4: Run focused server tests and verify GREEN**

Run: `npm run test:wedding-server`

Expected: every wedding server test passes.

- [ ] **Step 5: Commit server behavior**

```bash
git add shared/types.ts server/src/wedding server/tests/wedding
git commit -m "feat: remove guests when restarting wedding contest"
```

### Task 2: Guest session clearing and confirmation copy

**Files:**

- Modify: `client/src/wedding/WeddingContext.tsx`
- Modify: `client/src/wedding/AdminWeddingApp.tsx`
- Test: `client/tests/wedding/WeddingAdmin.test.tsx`
- Test: `client/tests/wedding/WeddingContext.test.tsx`

**Interfaces:**

- Consumes: `WeddingServerEvents["wedding:contestReset"]`
- Changes: restart dialog copy explicitly warns that participants must join again.

- [ ] **Step 1: Write failing client tests**

```tsx
assert.match(
  JSON.stringify(renderer.toJSON()),
  /Все участники, очки и ответы будут удалены.*подключиться заново/,
);
```

Add a context test that seeds `partyplay:wedding-participant`, dispatches `wedding:contestReset`, and asserts the saved session and rendered guest state are cleared.

- [ ] **Step 2: Run focused client tests and verify RED**

Run: `npm run test:wedding-client`

Expected: the copy assertion fails and the context does not handle `wedding:contestReset`.

- [ ] **Step 3: Handle the reset event and update the dialog**

```ts
const onContestReset = () => {
  clearWeddingSession();
  setGuestState(null);
  setParticipants([]);
};
```

Register and unregister `wedding:contestReset` alongside the existing wedding socket listeners. Change the dialog description to `Все участники, очки и ответы будут удалены. Гостям потребуется подключиться заново.`

- [ ] **Step 4: Run focused client tests and verify GREEN**

Run: `npm run test:wedding-client`

Expected: every wedding client test passes.

- [ ] **Step 5: Commit client behavior**

```bash
git add client/src/wedding client/tests/wedding
git commit -m "feat: require guests to rejoin wedding contests"
```

### Task 3: Full verification

**Files:**

- Verify only; no planned source changes.

**Interfaces:**

- Consumes the finished restart flow.
- Produces verification evidence.

- [ ] **Step 1: Run all automated checks**

Run `npm run test:wedding-server`, `npm run test:wedding-client`, `npm run test:server`, `npm run test:reconnect-client`, `npm run test:game-screen`, `npm run test:theme`, `npm run build`, and `npm run format:check`.

Expected: every command exits with code 0.

- [ ] **Step 2: Run browser end-to-end verification**

Join a guest, score an answer, finish the contest, inspect final results, confirm `Начать новый конкурс`, verify the guest sees the join screen, and rejoin with the same name as a new participant with score zero.

- [ ] **Step 3: Confirm repository cleanliness**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and no uncommitted source changes.
