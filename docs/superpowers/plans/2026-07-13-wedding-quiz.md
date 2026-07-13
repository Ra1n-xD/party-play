# Wedding Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved four-day, single-room wedding quiz with `/wedding` guest voting and `/admin` mobile host controls.

**Architecture:** A dedicated `/wedding` Socket.IO namespace owns a persisted singleton `WeddingRoomService`; separate guest and host state serializers enforce privacy. The React entry point selects the Bunker, guest wedding, or host wedding application by pathname, and pure screen components consume a focused wedding context.

**Tech Stack:** TypeScript 5.6, Node.js 22 test runner, Express 4, Socket.IO 4.8, React 18, react-test-renderer, Vite 5, CSS.

## Global Constraints

- Preserve all existing Bunker behavior and event contracts.
- Use the exact title `ДанИИл и Шаша`.
- Keep one singleton room for exactly 96 hours from creation.
- Guests use `/wedding`; the host uses `/admin`; no room code is required.
- Guest payloads never contain correctness, the correct option, scores, or other guests' answers.
- A guest answer is final for the current question.
- `Следующий вопрос`, `Начать вопрос`, and `Закончить конкурс` require confirmation.
- Support per-question `letters` (`А Б В Г`) and `numbers` (`1 2 3 4`) option styles.
- Keep the UI usable at 320 CSS pixels and mobile-first.

---

### Task 1: Shared Contract and Persisted Wedding Domain

**Files:**

- Modify: `shared/types.ts`
- Create: `server/src/wedding/weddingRoom.ts`
- Create: `server/tests/wedding/weddingRoom.test.ts`
- Modify: `.gitignore`

**Interfaces:**

- Produces: `WeddingPhase`, `WeddingOptionStyle`, `GuestWeddingState`, `HostWeddingState`, `WeddingClientEvents`, and `WeddingServerEvents` in `shared/types.ts`.
- Produces: `WeddingRoomService` with `createRoom`, `getGuestState`, `getHostState`, `joinNew`, `rejoin`, `disconnectSocket`, `setDraft`, `startQuestion`, `prepareNextQuestion`, `submitAnswer`, `adjustScore`, and `finishContest`.
- Persists: `WeddingRoomSnapshot` through `FileWeddingRoomStore` at a configurable path.

- [ ] **Step 1: Write failing domain tests**

```ts
test("creates one room for exactly 96 hours and restores it", () => {
  const file = join(tempDir, "wedding-room.json");
  const now = 1_000;
  const first = new WeddingRoomService(new FileWeddingRoomStore(file), () => now);
  const room = first.createRoom();
  assert.equal(room.expiresAt, now + 96 * 60 * 60 * 1_000);
  assert.throws(() => first.createRoom(), /уже создана/);
  const restored = new WeddingRoomService(new FileWeddingRoomStore(file), () => now + 1);
  assert.equal(restored.getHostState()?.expiresAt, room.expiresAt);
});

test("records one answer, scores it, and identifies the first correct response", () => {
  const service = createService();
  service.createRoom();
  const vera = service.joinNew("Вера", "socket-vera");
  service.setDraft("letters", 1);
  service.startQuestion();
  service.submitAnswer(vera.participantId, "socket-vera", 1);
  assert.throws(() => service.submitAnswer(vera.participantId, "socket-vera", 2), /уже принят/);
  const host = service.getHostState()!;
  assert.equal(host.answers[0].firstCorrect, true);
  assert.equal(host.participants[0].correctAnswers, 1);
  assert.equal("correctOption" in service.getGuestState(vera.participantId)!, false);
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `TSX_TSCONFIG_PATH=server/tsconfig.json node --import tsx --test server/tests/wedding/weddingRoom.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/src/wedding/weddingRoom.ts`.

- [ ] **Step 3: Add the typed contract and minimal domain implementation**

```ts
export type WeddingPhase = "PREPARING" | "OPEN" | "FINISHED";
export type WeddingOptionStyle = "letters" | "numbers";

export interface GuestWeddingState {
  phase: WeddingPhase;
  questionNumber: number;
  optionStyle: WeddingOptionStyle | null;
  expiresAt: number;
  participantId: string;
  participantName: string;
  hasAnswered: boolean;
  selectedOption: number | null;
}

export interface HostWeddingState {
  phase: WeddingPhase;
  questionNumber: number;
  optionStyle: WeddingOptionStyle;
  correctOption: number;
  expiresAt: number;
  participants: WeddingHostParticipant[];
  answers: WeddingHostAnswer[];
}
```

Implement file-backed atomic snapshots with `writeFileSync(tempPath)` and `renameSync(tempPath, path)`. Normalize restored participants to `connected: false` and `socketId: null`. Clone room state before every mutation and restore the clone if persistence throws.

- [ ] **Step 4: Run domain tests and verify GREEN**

Run: `TSX_TSCONFIG_PATH=server/tsconfig.json node --import tsx --test server/tests/wedding/weddingRoom.test.ts`

Expected: all wedding room tests PASS.

- [ ] **Step 5: Commit the domain**

```bash
git add .gitignore shared/types.ts server/src/wedding/weddingRoom.ts server/tests/wedding/weddingRoom.test.ts
git commit -m "feat: add persisted wedding quiz domain"
```

### Task 2: Wedding Socket.IO Namespace

**Files:**

- Create: `server/src/wedding/socketHandlers.ts`
- Create: `server/tests/wedding/Wedding.integration.test.ts`
- Modify: `server/src/index.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `WeddingRoomService` and the wedding event maps from Task 1.
- Produces: `registerWeddingHandlers(namespace, service)` and `createWeddingRoomService()`.
- Adds script: `test:wedding-server`.

- [ ] **Step 1: Write failing Socket.IO integration tests**

```ts
test("keeps host details private while broadcasting an accepted guest vote", async () => {
  host.emit("wedding:createRoom");
  await host.waitFor("wedding:hostState");
  guest.emit("wedding:joinNew", { name: "Вера" });
  const joined = await guest.waitFor("wedding:joined");
  host.emit("wedding:setDraft", { optionStyle: "letters", correctOption: 1 });
  host.emit("wedding:startQuestion");
  await guest.waitFor("wedding:guestState", (state) => state.phase === "OPEN");
  guest.emit("wedding:answer", { optionIndex: 1 });
  const guestState = await guest.waitFor("wedding:guestState", (state) => state.hasAnswered);
  assert.equal(JSON.stringify(guestState).includes("correctOption"), false);
  assert.equal(JSON.stringify(guestState).includes("correctAnswers"), false);
  const hostState = await host.waitFor("wedding:hostState", (state) => state.answers.length === 1);
  assert.equal(hostState.answers[0].participantId, joined.participantId);
  assert.equal(hostState.answers[0].firstCorrect, true);
});
```

Also test name-based seat replacement, offline presence, host-only mutation enforcement, next-question waiting, manual score changes, and final completion.

- [ ] **Step 2: Run the namespace test and verify RED**

Run: `npm run test:wedding-server`

Expected: FAIL because the script and `registerWeddingHandlers` do not exist.

- [ ] **Step 3: Implement the namespace and production registration**

```ts
const weddingNamespace = io.of("/wedding");
registerWeddingHandlers(weddingNamespace, createWeddingRoomService());
```

Each connected socket begins without a role. `wedding:hostConnect` assigns host authority for that socket. `wedding:joinNew` and `wedding:rejoin` bind a participant; a successful rejoin disconnects the prior owner socket. Every mutation serializes once and broadcasts separate host, guest, and participant-list payloads.

- [ ] **Step 4: Run namespace and existing server tests**

Run: `npm run test:wedding-server && npm run test:server`

Expected: all wedding tests and the existing 139 server tests PASS.

- [ ] **Step 5: Commit the namespace**

```bash
git add package.json server/src/index.ts server/src/wedding/socketHandlers.ts server/tests/wedding/Wedding.integration.test.ts
git commit -m "feat: add wedding quiz socket namespace"
```

### Task 3: Client Routing, Session, and Guest Flow

**Files:**

- Create: `client/src/wedding/weddingSocket.ts`
- Create: `client/src/wedding/WeddingContext.tsx`
- Create: `client/src/wedding/GuestWeddingApp.tsx`
- Create: `client/src/wedding/WeddingBrand.tsx`
- Create: `client/tests/wedding/WeddingGuest.test.tsx`
- Modify: `client/src/main.tsx`
- Modify: `package.json`

**Interfaces:**

- Consumes: `GuestWeddingState`, `WeddingParticipantSummary`, and wedding event maps.
- Produces: `WeddingProvider`, `useWedding`, `GuestWeddingApp`, and pathname-based application selection.
- Adds script: `test:wedding-client`.

- [ ] **Step 1: Write failing guest rendering and route tests**

```tsx
test("guest buttons match the server-selected option style and hide correctness", () => {
  const html = renderToStaticMarkup(
    <GuestWeddingScreen
      state={{ ...openState, optionStyle: "numbers" }}
      onAnswer={() => undefined}
    />,
  );
  assert.match(html, />1<.*>2<.*>3<.*>4</s);
  assert.doesNotMatch(html, /правильн|неверн/i);
});

test("preparing guests see no active answer buttons", () => {
  const html = renderToStaticMarkup(
    <GuestWeddingScreen state={{ ...openState, phase: "PREPARING" }} onAnswer={() => undefined} />,
  );
  assert.match(html, /Ждём следующий вопрос/);
  assert.doesNotMatch(html, /wedding-answer-button/);
});
```

Add a source-level route assertion proving `/wedding` and `/admin` mount wedding providers while Bunker paths keep `GameProvider`.

- [ ] **Step 2: Run guest client tests and verify RED**

Run: `npm run test:wedding-client`

Expected: FAIL because wedding client modules do not exist.

- [ ] **Step 3: Implement the socket context, session, and guest screens**

Store `{ participantId, participantName }` under `partyplay:wedding-participant`. Install all socket listeners before connecting. Attempt session rejoin once per socket ID; otherwise show participant search, existing-name selection, and first-time name creation. Render `PREPARING`, `OPEN`, answered, reconnecting, expired, and `FINISHED` states without any host-only data.

- [ ] **Step 4: Run guest and existing client tests**

Run: `npm run test:wedding-client && npm run test:reconnect-client && npm run test:game-screen && npm run test:theme`

Expected: all new and existing client tests PASS.

- [ ] **Step 5: Commit the guest flow**

```bash
git add package.json client/src/main.tsx client/src/wedding client/tests/wedding/WeddingGuest.test.tsx
git commit -m "feat: add wedding guest voting flow"
```

### Task 4: Mobile Admin Flow and Wedding Styling

**Files:**

- Create: `client/src/wedding/AdminWeddingApp.tsx`
- Create: `client/src/wedding/WeddingConfirmDialog.tsx`
- Create: `client/src/styles/wedding.css`
- Create: `client/tests/wedding/WeddingAdmin.test.tsx`
- Modify: `client/src/wedding/WeddingContext.tsx`
- Modify: `client/src/main.tsx`

**Interfaces:**

- Consumes: `HostWeddingState` and context host actions.
- Produces: two-tab mobile admin, draft controls, chronological answer feed, score steppers, and confirmation dialogs.

- [ ] **Step 1: Write failing admin component tests**

```tsx
test("host tabs expose question controls and editable scores", () => {
  const html = renderToStaticMarkup(<AdminWeddingScreen state={hostState} actions={actions} />);
  assert.match(html, /Текущий вопрос/);
  assert.match(html, /Счёт участников/);
  assert.match(html, /первый верный/);
  assert.match(html, /верных: 3/);
  assert.match(html, /aria-label="Уменьшить счёт Вера"/);
  assert.match(html, /aria-label="Увеличить счёт Вера"/);
});

test("phase actions require confirmation before invoking the socket action", async () => {
  const renderer = create(<AdminWeddingScreen state={hostState} actions={actions} />);
  await act(async () => findButton(renderer, "Следующий вопрос").props.onClick());
  assert.equal(actions.prepareNextQuestion.calls.length, 0);
  assert.ok(findButton(renderer, "Да, перейти дальше"));
});
```

- [ ] **Step 2: Run admin tests and verify RED**

Run: `npm run test:wedding-client`

Expected: FAIL because the admin screen and confirmation dialog do not exist.

- [ ] **Step 3: Implement the admin screens and approved visual theme**

Render shared tabs in `PREPARING`, `OPEN`, and `FINISHED`. Sort scores by descending count then locale-aware Russian name. Disable decrement at zero. Use native dialog semantics with focusable cancel and confirm buttons. Apply scoped `.wedding-*` CSS for ivory, burgundy, gold, rose, the heart motif, two-by-two answer buttons, 44px touch targets, and 320px responsiveness.

- [ ] **Step 4: Run all client tests and both builds**

Run: `npm run test:wedding-client && npm run test:reconnect-client && npm run test:game-screen && npm run test:theme && npm run build`

Expected: every test and both TypeScript builds PASS.

- [ ] **Step 5: Commit the admin experience**

```bash
git add client/src/wedding client/src/styles/wedding.css client/src/main.tsx client/tests/wedding/WeddingAdmin.test.tsx
git commit -m "feat: add mobile wedding host controls"
```

### Task 5: Full Verification and Operational Polish

**Files:**

- Modify if required by verification: only files already listed above.

**Interfaces:**

- Consumes: the complete wedding feature.
- Produces: a clean build, formatting, and regression result.

- [ ] **Step 1: Run the complete focused test matrix**

```bash
npm run test:wedding-server
npm run test:wedding-client
npm run test:server
npm run test:reconnect-client
npm run test:game-screen
npm run test:theme
```

Expected: all commands PASS with zero failed tests.

- [ ] **Step 2: Run build and formatting verification**

Run: `npm run build && npm run format:check`

Expected: both workspaces build and Prettier reports all files formatted.

- [ ] **Step 3: Inspect final diff and runtime persistence exclusions**

Run: `git diff --check && git status --short && git check-ignore server/.data/wedding-room.json`

Expected: no whitespace errors; only intentional files appear; runtime snapshot path is ignored.

- [ ] **Step 4: Commit any verification-only fixes**

```bash
git add shared/types.ts package.json package-lock.json server/src/index.ts server/src/wedding server/tests/wedding client/src/main.tsx client/src/wedding client/src/styles/wedding.css client/tests/wedding
git commit -m "fix: polish wedding quiz reliability"
```

Skip this commit when verification required no file changes.
