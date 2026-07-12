# Shared Situation Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore complete bunker information on desktop and add the missing mobile catastrophe icon while keeping desktop non-interactive and both viewports backed by the same details component.

**Architecture:** Export `ScenarioDetails` from the existing `ScenarioSummary.tsx` module. `ScenarioSummary` uses it for the mobile “Ситуация” tab, and `GameStatusHeader` renders the same unit as an always-visible desktop row beneath the Codex metrics.

**Tech Stack:** React 18, TypeScript, react-icons, CSS, Node test runner.

## Global Constraints

- Change only the active Bunker game interface.
- Do not change server state, shared types, game phases, handlers, timers, or voting mechanics.
- Desktop situation details must always be visible and must not be a dropdown.
- Desktop and mobile must render the same catastrophe, bunker, capacity, and threat content.
- Mobile must show the red warning icon beside the scenario title.

---

### Task 1: Shared situation details and mobile warning icon

**Files:**

- Modify: `client/tests/game-screen/GameScreen.test.tsx`
- Modify: `client/src/screens/game/ScenarioSummary.tsx`

**Interfaces:**

- Consumes: `gameState: ClientGameState`, `idPrefix: string`.
- Produces: `ScenarioDetails({ gameState, idPrefix }): JSX.Element` and mobile summary markup containing `gs-scenario-alert-icon`.

- [ ] **Step 1: Write the failing component contracts**

Render the always-expanded `ScenarioSummary` and assert that it contains `gs-scenario-alert-icon`, `gs-scenario-details`, catastrophe description, every revealed bunker card, capacity, and revealed threat. Render `ScenarioDetails` directly and assert the same full data.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:game-screen`
Expected: FAIL because `ScenarioDetails` is not exported and the mobile icon is absent.

- [ ] **Step 3: Extract the shared implementation**

Move the existing details JSX into exported `ScenarioDetails`, keep the same `is-new` bunker-card calculation, render it from `ScenarioSummary`, and add `<FiAlertTriangle />` in `gs-scenario-alert-icon` before the title.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:game-screen`
Expected: all game-screen tests pass.

### Task 2: Always-visible desktop situation details

**Files:**

- Modify: `client/tests/game-screen/GameScreen.test.tsx`
- Modify: `client/src/screens/game/GameStatusHeader.tsx`
- Modify: `client/src/styles/game-screen.css`

**Interfaces:**

- Consumes: `ScenarioDetails` from Task 1.
- Produces: a `gs-desktop-situation-details` row in `GameStatusHeader`, with no button, chevron, `aria-expanded`, or toggle handler.

- [ ] **Step 1: Write the failing desktop contract**

Assert that `GameStatusHeader` contains `gs-desktop-situation-details`, full bunker and threat content, and no dropdown semantics.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:game-screen`
Expected: FAIL because desktop does not render the shared details.

- [ ] **Step 3: Render and style the shared desktop details**

Import `ScenarioDetails`, render it after the metrics inside `gs-desktop-situation-details`, span the full status grid, and hide only that desktop instance at `max-width: 768px` because mobile renders the same content inside “Ситуация”.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:game-screen`
Expected: all game-screen tests pass.

### Task 3: Verification

**Files:**

- Verify: `client/src/screens/game/ScenarioSummary.tsx`
- Verify: `client/src/screens/game/GameStatusHeader.tsx`
- Verify: `client/src/styles/game-screen.css`
- Verify: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: completed Tasks 1 and 2.
- Produces: a tested, buildable, responsive game interface.

- [ ] **Step 1: Run regression tests**

Run: `npm run test:game-screen`
Expected: 0 failures.

- [ ] **Step 2: Build the client**

Run: `npm -w client run build`
Expected: TypeScript and Vite exit successfully.

- [ ] **Step 3: Check formatting and whitespace**

Run: `git diff --check && npx prettier --check client/src/screens/game/ScenarioSummary.tsx client/src/screens/game/GameStatusHeader.tsx client/src/styles/game-screen.css client/tests/game-screen/GameScreen.test.tsx`
Expected: no errors.

- [ ] **Step 4: Verify responsive presentation**

At desktop width, confirm static full details beneath the Codex row and no scenario dropdown. At mobile width, confirm the warning icon and the same full information in “Ситуация”, with no horizontal overflow.
