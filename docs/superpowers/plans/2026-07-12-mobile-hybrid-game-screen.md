# Mobile Hybrid Game Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the mobile tab-based structure of `feature/new-design` while adopting the green/gold visual language, room header, and compact action bar from `feature/new-design-codex`.

**Architecture:** Add one presentation-only `GameRoomHeader` component receiving existing state and callbacks through props. Integrate it into `GameScreen`, remove the duplicated host-management action from `GameStatusHeader`, and update only the scoped `game-screen.css` tokens and responsive layout.

**Tech Stack:** React 18, TypeScript 5.6, React Icons, Vite 5, Node built-in test runner with `tsx`.

## Global Constraints

- Change only `GameScreen` presentation components, `client/src/styles/game-screen.css`, and the existing GameScreen test file.
- Do not modify server code, `GameContext`, shared types, Socket.IO events, phase routing, or game rules.
- Preserve `MobileGameTabs`, compact public player cards, `CharacterDossier`, `ScenarioSummary`, `AccessibleModal`, and `HostControlDialog` behavior.
- Use existing `roomCode`, `connected`, `leaveRoom`, `adminPause`, and `adminUnpause` context APIs.
- Hide the management button for non-hosts.
- Mobile action buttons stay in one row and the bar is no taller than 72 px excluding safe-area.
- All primary interactive targets are at least 44×44 px.
- No horizontal viewport overflow at 320 px.

---

### Task 1: Room header component

**Files:**

- Create: `client/src/screens/game/GameRoomHeader.tsx`
- Modify: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: `roomCode`, `connected`, `canManageGame`, `onOpenHostControls`, `onLeaveRoom`.
- Produces: `GameRoomHeader` with brand, room code, connection status, conditional management, and exit controls.

- [ ] **Step 1: Write the failing component tests**

Add static-render assertions that the header exposes `Бункер`, `AX-204`, `Связь установлена`, accessible names `Управление игрой` and `Выйти из комнаты`, and omits management when `canManageGame={false}`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:game-screen`

Expected: FAIL because `GameRoomHeader` does not exist.

- [ ] **Step 3: Implement GameRoomHeader**

Use `FiHome`, `FiSettings`, `FiLogOut`, `FiWifi`, and `FiWifiOff`. Render native buttons with `type="button"` and the exact accessible names from Step 1. Do not import `useGame` or the socket.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:game-screen`

Expected: all GameScreen tests pass.

---

### Task 2: Integrate existing room actions

**Files:**

- Modify: `client/src/screens/GameScreen.tsx`
- Modify: `client/src/screens/game/GameStatusHeader.tsx`
- Modify: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: Task 1 `GameRoomHeader`.
- Produces: a GameScreen header wired to existing `openHostControls` and `leaveRoom` callbacks.

- [ ] **Step 1: Add a source-level failing integration assertion**

Assert that `GameScreen.tsx` renders `GameRoomHeader`, passes `roomCode={roomCode}`, `onOpenHostControls={openHostControls}`, and `onLeaveRoom={leaveRoom}`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:game-screen`

Expected: FAIL because the integration is absent.

- [ ] **Step 3: Wire the existing context values**

Import `GameRoomHeader`, destructure `roomCode` and `leaveRoom`, and render the header before `GameStatusHeader`. Remove `canManageGame` and `onOpenHostControls` from `GameStatusHeader` because management now has one canonical location.

- [ ] **Step 4: Run tests and client build**

Run: `npm run test:game-screen`

Run: `npm -w client run build`

Expected: both commands exit 0.

---

### Task 3: Green/gold scoped visual system and compact mobile actions

**Files:**

- Modify: `client/src/styles/game-screen.css`
- Modify: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: existing `.command-game-screen` and new `.gs-room-header*` classes.
- Produces: responsive hybrid visual design with unchanged component behavior.

- [ ] **Step 1: Add failing CSS contract assertions**

Assert that the scoped root defines `--gs-page: #07100c`, `--gs-gold: #efbd58`, and `--gs-green: #76c69e`; that `.gs-room-action` has `min-width: 44px` and `min-height: 44px`; and that the mobile `.gs-action-bar` uses `grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.8fr)` with content padding based on `82px` rather than `154px`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:game-screen`

Expected: FAIL because the hybrid CSS contracts are absent.

- [ ] **Step 3: Implement scoped tokens and room header styles**

Define the approved green/gold tokens on `.screen.command-game-screen`; add room header, logo, room code, connection, and action styles; replace purple-only surfaces and focus accents within the GameScreen scope.

- [ ] **Step 4: Compact the mobile action bar**

At `max-width: 768px`, keep two actions in one row using `0.8fr/1.8fr`, 8 px gaps, 8 px padding, and minimum 44 px button height. A single action spans both columns. Set GameScreen bottom padding and error-toast offset to `82px + safe-area`.

- [ ] **Step 5: Verify responsive compilation**

Run: `npm run test:game-screen`

Run: `npm run build`

Expected: tests and both workspace builds pass.

---

### Task 4: Browser verification

**Files:**

- Modify if needed: files from Tasks 1–3 only.

**Interfaces:**

- Consumes: completed local application.
- Produces: measured mobile acceptance evidence.

- [ ] **Step 1: Start the local app and create an eight-player game**

Run: `npm run dev`

Use the visible lobby controls to create a room, add seven bots, and start the game.

- [ ] **Step 2: Verify 390×844**

Confirm all three tabs work, the room header exposes existing controls, the action bar is no taller than 72 px, and no horizontal overflow exists.

- [ ] **Step 3: Verify 320×800**

Confirm `document.documentElement.scrollWidth === window.innerWidth`, all visible primary buttons are at least 44 px high, header controls fit, and action labels remain readable.

- [ ] **Step 4: Run final commands**

Run: `npm run test:game-screen`

Run: `npm run build`

Run: `npx prettier --check client/src/screens/GameScreen.tsx client/src/screens/game/GameRoomHeader.tsx client/src/screens/game/GameStatusHeader.tsx client/src/styles/game-screen.css client/tests/game-screen/GameScreen.test.tsx docs/superpowers/specs/2026-07-12-mobile-hybrid-game-screen-design.md docs/superpowers/plans/2026-07-12-mobile-hybrid-game-screen.md`

Run: `git diff --check`

Expected: every command exits 0.
