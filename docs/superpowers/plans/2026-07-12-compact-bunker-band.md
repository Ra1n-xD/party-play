# Compact Bunker Band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the duplicated catastrophe description and replace the tall situation-detail grid with a compact full-width bunker band on desktop and mobile.

**Architecture:** `ScenarioSummary` displays the catastrophe icon, title, and description together. Shared `ScenarioDetails` becomes a bunker-only band containing revealed bunker cards, capacity, and an optional threat card, so desktop and mobile retain identical data without duplicate catastrophe content.

**Tech Stack:** React 18, TypeScript, CSS, Node test runner.

## Global Constraints

- Change only the active Bunker game interface.
- Do not change server state, shared types, game phases, handlers, timers, or voting mechanics.
- Do not duplicate the catastrophe description below its primary summary.
- Keep the bunker band full-width, compact, static, and free of dropdown behavior.
- Render a revealed threat as the final amber-accented card in the bunker band.

---

### Task 1: Consolidate catastrophe copy and bunker data

**Files:**

- Modify: `client/tests/game-screen/GameScreen.test.tsx`
- Modify: `client/src/screens/game/ScenarioSummary.tsx`
- Modify: `client/src/screens/game/GameStatusHeader.tsx`

**Interfaces:**

- Consumes: existing `ScenarioDetails({ idPrefix, gameState })` and `ClientGameState`.
- Produces: summary markup containing one `gs-scenario-description`; bunker-band markup containing no `gs-catastrophe-details` and an optional `gs-bunker-threat-card`.

- [ ] **Step 1: Write the failing contracts**

Assert that mobile summary renders the catastrophe description exactly once next to the title, that `ScenarioDetails` contains bunker cards/capacity but no catastrophe block, and that a revealed threat is rendered inside `gs-bunker-cards` as `gs-bunker-threat-card`. Assert that desktop header also contains the description exactly once.

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:game-screen`
Expected: FAIL because description is still repeated in `ScenarioDetails` and threat is a separate detail column.

- [ ] **Step 3: Implement the shared content structure**

Add the catastrophe description to `ScenarioSummary` summary content, remove `gs-catastrophe-details` from `ScenarioDetails`, and append the threat as a final card inside `gs-bunker-cards`. Keep the desktop primary scenario description unchanged and render the bunker-only `ScenarioDetails` beneath it.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm run test:game-screen`
Expected: all game-screen tests pass.

### Task 2: Compact full-width bunker band styling

**Files:**

- Modify: `client/tests/game-screen/GameScreen.test.tsx`
- Modify: `client/src/styles/game-screen.css`

**Interfaces:**

- Consumes: `gs-desktop-situation-details`, `gs-scenario-details`, `gs-bunker-details`, `gs-bunker-cards`, and `gs-bunker-threat-card` from Task 1.
- Produces: one content-sized bunker band whose cards flow horizontally and whose threat card uses an amber accent.

- [ ] **Step 1: Write the failing CSS contracts**

Assert that desktop shared details use one column, bunker cards use responsive horizontal columns, card padding is compact, the threat card is amber-accented, and mobile retains a single-column card flow without overflow.

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:game-screen`
Expected: FAIL because the current three-card detail grid stretches vertically and threat has separate styling.

- [ ] **Step 3: Implement compact styles**

Remove obsolete catastrophe/threat detail-column styles, make `gs-bunker-details` a single full-width surface with compact padding, use `repeat(auto-fit, minmax(min(190px, 100%), 1fr))` for the cards, and style `gs-bunker-threat-card` with the existing gold/amber palette. Keep mobile card flow at one column.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm run test:game-screen`
Expected: all game-screen tests pass.

### Task 3: Verification

**Files:**

- Verify: `client/src/screens/game/ScenarioSummary.tsx`
- Verify: `client/src/screens/game/GameStatusHeader.tsx`
- Verify: `client/src/styles/game-screen.css`
- Verify: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: Tasks 1 and 2.
- Produces: tested and responsive compact situation UI.

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

At desktop width, confirm one compact bunker band without duplicated catastrophe text. At mobile width, confirm the description sits with the scenario title and the bunker band uses the same data without horizontal overflow.
