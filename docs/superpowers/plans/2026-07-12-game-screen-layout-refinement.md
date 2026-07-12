# Game Screen Layout Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the existing Bunker game screen with a full-width desktop workspace, a Codex-derived information strip, compact mobile information and actions, distinct player-state accents, and a corrected desktop host dialog.

**Architecture:** Keep `GameScreen` and its existing child components. Extend `GameStatusHeader` into the responsive information strip and reuse `ScenarioSummary` inside it on desktop, while the existing mobile “Ситуация” tab remains the only mobile scenario surface. Keep every existing callback and server-authoritative state path unchanged.

**Tech Stack:** React 18, TypeScript, scoped CSS, Node test runner, React static rendering.

## Global Constraints

- Change only the active game screen.
- Do not add or change game logic, state transitions, event handlers, or server events.
- Do not replace the whole screen with the `feature/new-design-codex` implementation.
- Keep interactive targets at least 44 by 44 pixels.
- Preserve the current mobile tabs and host-control behavior.

---

### Task 1: Responsive information strip contracts

**Files:**

- Modify: `client/tests/game-screen/GameScreen.test.tsx`
- Modify: `client/src/screens/game/GameStatusHeader.tsx`
- Modify: `client/src/screens/GameScreen.tsx`

**Interfaces:**

- `GameStatusHeader` continues to consume `gameState`, phase copy, voting copy, turn state, skip-discussion capability, and its existing callback.
- Add `scenarioExpanded: boolean` and `onToggleScenario: () => void` so the desktop strip reuses the current scenario expansion state.

- [ ] **Step 1: Write failing component and source tests**

Assert that rendered status markup contains `gs-info-strip`, `gs-info-scenario`, timer/capacity/round/progress metrics, and that `GameScreen` no longer renders a separate `gs-scenario-desktop` wrapper.

- [ ] **Step 2: Run the focused suite and verify RED**

Run: `npm run test:game-screen`

Expected: the new information-strip assertions fail because the current header only renders phase copy, round circles, and timer actions.

- [ ] **Step 3: Implement the minimal responsive strip markup**

Render the existing `ScenarioSummary` as the desktop scenario cell and derive reveal progress using public player data:

```ts
const revealedCards = gameState.players.reduce(
  (total, player) => total + player.revealedAttributes.length + (player.actionCardRevealed ? 1 : 0),
  0,
);
const totalCards = gameState.players.length * 7;
```

Keep `Timer`, voting copy, skip discussion, round values, and scenario toggle callbacks unchanged.

- [ ] **Step 4: Run the focused suite and verify GREEN**

Run: `npm run test:game-screen`

Expected: all tests pass.

### Task 2: Header, layout, state, action, and admin CSS contracts

**Files:**

- Modify: `client/tests/game-screen/GameScreen.test.tsx`
- Modify: `client/src/screens/game/GameRoomHeader.tsx`
- Modify: `client/src/styles/game-screen.css`

**Interfaces:**

- `GameRoomHeader` keeps all current props and handlers.
- Existing player state classes `is-me` and `is-current-turn` remain the styling contract.
- Existing action and host-dialog class names remain unchanged.

- [ ] **Step 1: Write failing markup and CSS contract tests**

Add assertions for:

```text
no “Протокол выживания” copy
full-width root (`width: 100%`, no 1200px cap)
auto-fit player grid with a 280px minimum
gold local-player treatment and green current-turn treatment
equal two-column mobile action grid
desktop host panel up to 1040px and two-column groups
mobile information selectors that hide scenario/capacity/progress and show timer/round
```

- [ ] **Step 2: Run the focused suite and verify RED**

Run: `npm run test:game-screen`

Expected: new assertions fail against the existing 1200-pixel root, subtitle, unequal mobile action columns, and three-column host groups.

- [ ] **Step 3: Implement the minimal markup and CSS**

Remove only the subtitle element from `GameRoomHeader`. Update scoped CSS to use the design tokens in the approved specification, including:

```css
.screen.command-game-screen {
  width: 100%;
  max-width: none;
}

.command-game-screen .gs-player-list {
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
}

@media (max-width: 768px) {
  .command-game-screen .gs-action-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

Make the desktop host dialog 900–1040 pixels wide with two group columns and restore one column on mobile. Replace remaining generic purple game-screen accents with green or gold without removing category-specific semantic colors.

- [ ] **Step 4: Run the focused suite and verify GREEN**

Run: `npm run test:game-screen`

Expected: all tests pass.

### Task 3: Verification and responsive QA

**Files:**

- Verify: all files changed by Tasks 1–2

- [ ] **Step 1: Run automated verification**

Run: `npm run test:game-screen`

Expected: all tests pass with no warnings.

- [ ] **Step 2: Run production compilation**

Run: `npm -w client run build`

Expected: TypeScript and Vite build succeed.

- [ ] **Step 3: Run formatting and diff checks**

Run Prettier on changed files in check mode and run `git diff --check`.

Expected: no formatting or whitespace errors.

- [ ] **Step 4: Inspect responsive behavior**

Use an active four-or-more-player game and inspect 320×700, 390×844, 1280×800, and 1920×1080. Confirm no horizontal overflow, equal mobile action dimensions, timer-and-round-only mobile strip, compact one-line header, three-to-five desktop player columns when space permits, distinct gold/green player states, and a usable desktop host dialog.
