# Wedding Contest Restart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the wedding host reset a finished contest while preserving the four-day room and every guest seat.

**Architecture:** Add one typed, host-only Socket.IO command backed by an atomic `WeddingRoomService.restartContest()` mutation. Expose it through the existing React wedding context and a confirmed admin action; existing full-state broadcasts move connected guests back to waiting automatically.

**Tech Stack:** TypeScript, Socket.IO, React 18, Node test runner, react-test-renderer

## Global Constraints

- Work directly on branch `main`.
- Preserve participant IDs, names, connection state, `createdAt`, and `expiresAt`.
- Reset question number, answers, current selections, and every score.
- Allow restart only from `FINISHED`.
- Use Russian UI and error copy.

---

### Task 1: Server-authoritative restart transition

**Files:**

- Modify: `shared/types.ts`
- Modify: `server/src/wedding/weddingRoom.ts`
- Modify: `server/src/wedding/socketHandlers.ts`
- Test: `server/tests/wedding/weddingRoom.test.ts`
- Test: `server/tests/wedding/Wedding.integration.test.ts`

**Interfaces:**

- Produces: `WeddingClientEvents["wedding:restartContest"]: () => void`
- Produces: `WeddingRoomService.restartContest(): HostWeddingState`

- [ ] **Step 1: Write failing domain and integration tests**

```ts
service.finishContest();
const before = service.getHostState()!;
const restarted = service.restartContest();
assert.equal(restarted.phase, "PREPARING");
assert.equal(restarted.questionNumber, 0);
assert.equal(restarted.correctOption, null);
assert.deepEqual(restarted.answers, []);
assert.equal(restarted.participants[0].correctAnswers, 0);
assert.equal(restarted.participants[0].id, before.participants[0].id);
assert.equal(restarted.expiresAt, before.expiresAt);
```

The socket test must emit `wedding:restartContest` from the host after `FINISHED`, assert the guest receives `PREPARING` with the same participant ID, and assert a guest emitter receives the existing host-only error.

- [ ] **Step 2: Run the focused server tests and verify RED**

Run: `npm run test:wedding-server`

Expected: TypeScript/runtime failure because `restartContest` and `wedding:restartContest` do not exist.

- [ ] **Step 3: Implement the minimal atomic transition**

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
    for (const participant of draft.participants) {
      participant.correctAnswers = 0;
      participant.answerOption = null;
      participant.answerSubmittedAt = null;
    }
    return this.serializeHost(draft);
  });
}
```

Register the typed event beside `wedding:endContest`, enforce `requireHost()`, call the service, and use `broadcastAll()`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm run test:wedding-server`

Expected: all wedding server tests pass.

- [ ] **Step 5: Commit the server transition**

```bash
git add shared/types.ts server/src/wedding server/tests/wedding
git commit -m "feat: restart finished wedding contests"
```

### Task 2: Confirmed admin restart action

**Files:**

- Modify: `client/src/wedding/WeddingContext.tsx`
- Modify: `client/src/wedding/AdminWeddingApp.tsx`
- Test: `client/tests/wedding/WeddingAdmin.test.tsx`

**Interfaces:**

- Consumes: `WeddingClientEvents["wedding:restartContest"]`
- Produces: `WeddingContextValue.restartContest(): void`
- Produces: `AdminWeddingActions.restartContest(): void`

- [ ] **Step 1: Write a failing client interaction test**

```tsx
const finished = { ...hostState, phase: "FINISHED" as const };
const { calls, actions } = createActions();
const renderer = create(<AdminWeddingScreen {...propsFor(finished, actions)} />);
await act(async () => findButton(renderer, "Начать новый конкурс").props.onClick());
assert.deepEqual(calls, []);
await act(async () => findButton(renderer, "Да, начать новый конкурс").props.onClick());
assert.deepEqual(calls, ["restart"]);
```

- [ ] **Step 2: Run the focused client test and verify RED**

Run: `npm run test:wedding-client`

Expected: failure because the restart action and button are missing.

- [ ] **Step 3: Add the context event and confirmed UI action**

Add `restartContest` to the context and emit `wedding:restartContest`. Extend `ConfirmationKind` with `restart`, add dialog copy explaining that scores and answers are erased, invoke the action in `confirmAction`, and render `Начать новый конкурс` on the finished card and final score screen. Disable it while disconnected.

- [ ] **Step 4: Run focused client tests and verify GREEN**

Run: `npm run test:wedding-client`

Expected: all wedding client tests pass.

- [ ] **Step 5: Commit the client action**

```bash
git add client/src/wedding client/tests/wedding/WeddingAdmin.test.tsx
git commit -m "feat: add wedding contest restart control"
```

### Task 3: Full verification

**Files:**

- Verify only; no planned source changes.

**Interfaces:**

- Consumes the completed server and client restart flow.
- Produces verification evidence.

- [ ] **Step 1: Run all automated checks**

Run `npm run test:wedding-server`, `npm run test:wedding-client`, `npm run test:server`, `npm run test:reconnect-client`, `npm run test:game-screen`, `npm run test:theme`, `npm run build`, and `npm run format:check`.

Expected: every command exits with code 0.

- [ ] **Step 2: Run browser end-to-end verification**

Create a room, join a guest, score one answer, finish the contest, confirm `Начать новый конкурс`, and verify admin preparation question 01 plus guest waiting state with the same name.

- [ ] **Step 3: Confirm repository cleanliness**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and no uncommitted source changes.
