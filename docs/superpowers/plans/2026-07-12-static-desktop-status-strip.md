# Static Desktop Status Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant game-screen voting counter and every dropdown interaction from the desktop status strip while preserving voting mechanics and mobile situation access.

**Architecture:** Keep server and shared voting state unchanged because the dedicated vote screen consumes it. Simplify only the active game-screen view model and status component: the desktop catastrophe cell becomes static, while the mobile `ScenarioSummary` remains always expanded inside the existing “Ситуация” tab.

**Tech Stack:** React 18, TypeScript, CSS, Node test runner.

## Global Constraints

- Change only the active Bunker game screen UI.
- Do not change voting mechanics, server state, shared types, phases, timers, or handlers.
- Desktop status content must not contain expandable controls or dropdowns.
- Mobile “Ситуация” must retain catastrophe, bunker, and threat information.

---

### Task 1: Remove redundant game-screen voting status

**Files:**

- Modify: `client/tests/game-screen/GameScreen.test.tsx`
- Modify: `client/src/screens/game/gameScreenViewModel.ts`
- Modify: `client/src/screens/game/GameStatusHeader.tsx`
- Modify: `client/src/screens/GameScreen.tsx`
- Modify: `client/src/screens/VoteScreen.tsx`
- Modify: `client/src/styles/global.css`

**Interfaces:**

- Consumes: existing `ClientGameState` voting fields without changing them.
- Produces: `GameScreenViewModel` and `GameStatusHeaderProps` without `votingInfo`.

- [ ] **Step 1: Write the failing test**

Assert that the view model has no `votingInfo` property and rendered game status markup does not contain “Голосование 1 из 1”.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:game-screen`
Expected: FAIL because `votingInfo` is still returned and rendered.

- [ ] **Step 3: Write minimal implementation**

Remove `votingInfo` from the view model interface and return value, remove the prop from `GameStatusHeader`, remove the status pill markup and caller prop, and remove the same counter markup and obsolete style from `VoteScreen`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:game-screen`
Expected: PASS.

### Task 2: Make desktop catastrophe status static

**Files:**

- Modify: `client/tests/game-screen/GameScreen.test.tsx`
- Modify: `client/src/screens/game/GameStatusHeader.tsx`
- Modify: `client/src/screens/GameScreen.tsx`
- Modify: `client/src/styles/game-screen.css`

**Interfaces:**

- Consumes: `gameState.catastrophe` for static title and description.
- Produces: desktop status markup with no `button`, `aria-expanded`, chevron, scenario state, or toggle callback.

- [ ] **Step 1: Write the failing test**

Assert that the desktop scenario cell renders as a static section, has no expand callback contract, and CSS does not give it a pointer cursor.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:game-screen`
Expected: FAIL because the scenario cell is currently an expandable button.

- [ ] **Step 3: Write minimal implementation**

Replace the desktop scenario button with a static section, remove chevron imports and expanded detail markup, remove state/callback wiring from `GameScreen`, and remove obsolete dropdown/detail styles. Keep the mobile always-expanded `ScenarioSummary` unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:game-screen`
Expected: PASS.

### Task 3: Verification

**Files:**

- Verify: `client/src/screens/GameScreen.tsx`
- Verify: `client/src/screens/game/GameStatusHeader.tsx`
- Verify: `client/src/screens/game/gameScreenViewModel.ts`
- Verify: `client/src/styles/game-screen.css`
- Verify: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: completed tasks 1 and 2.
- Produces: a buildable, formatted active game screen.

- [ ] **Step 1: Run regression tests**

Run: `npm run test:game-screen`
Expected: all tests pass.

- [ ] **Step 2: Build the client**

Run: `npm -w client run build`
Expected: TypeScript and Vite build exit successfully.

- [ ] **Step 3: Check formatting and whitespace**

Run: `git diff --check && npx prettier --check client/src/screens/GameScreen.tsx client/src/screens/game/GameStatusHeader.tsx client/src/screens/game/gameScreenViewModel.ts client/src/styles/game-screen.css client/tests/game-screen/GameScreen.test.tsx`
Expected: no whitespace or formatting errors.
