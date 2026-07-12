# Codex Status Strip Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the approximate game information strip with the actual Codex desktop structure and styling while retaining a two-cell timer-and-round mobile layout.

**Architecture:** Modify only `GameStatusHeader` and its scoped status-strip CSS. The desktop component owns its catastrophe summary and expansion details directly, while `GameScreen` continues using the existing `ScenarioSummary` only in the mobile “Ситуация” tab.

**Tech Stack:** React 18, TypeScript, react-icons, scoped CSS, Node test runner, React static rendering.

## Global Constraints

- Do not transfer the rest of the Codex game screen.
- Do not change server state, shared types, game phases, handlers, or timers.
- Match the supplied Codex status strip on desktop as closely as existing data permits.
- At 768 pixels and below, display only timer and round in the top strip.

---

### Task 1: Codex status strip structure and data mapping

**Files:**

- Modify: `client/tests/game-screen/GameScreen.test.tsx`
- Modify: `client/src/screens/game/GameStatusHeader.tsx`

**Interfaces:**

- Keep all existing `GameStatusHeaderProps` unchanged.
- Continue consuming `gameState`, `phaseLabel`, `phaseDescription`, `votingInfo`, `scenarioExpanded`, and the existing toggle/skip callbacks.

- [ ] **Step 1: Write failing component contracts**

Render `GameStatusHeader` with alive and eliminated players and assert the Codex structure:

```ts
assert.match(html, /gs-codex-scenario-icon/);
assert.match(html, /Сценарий катастрофы/);
assert.match(html, /Началось вторжение/);
assert.match(html, />2<span>\/1<\/span>/);
assert.match(html, /02 \/ 05/);
assert.equal((html.match(/gs-info-round-segment/g) ?? []).length, 5);
```

Also assert that round 2 produces exactly two filled progress segments and that the desktop status component no longer renders the generic `ScenarioSummary` class structure.

- [ ] **Step 2: Run the suite and verify RED**

Run: `npm run test:game-screen`

Expected: the new icon/copy, alive-player capacity, zero-padded progress, and segment assertions fail against the approximate implementation.

- [ ] **Step 3: Implement the Codex markup**

Use `FiAlertTriangle`, `FiChevronDown`, `FiChevronUp`, `FiClock`, `FiRadio`, and `FiShield`. Render catastrophe copy directly, map capacity to alive players, map progress to `roundNumber/totalRounds`, and preserve expansion/skip handlers. Render revealed bunker cards and threat details below the entire strip when expanded.

- [ ] **Step 4: Run the suite and verify GREEN**

Run: `npm run test:game-screen`

Expected: all game-screen tests pass.

### Task 2: Pixel-fidelity CSS and responsive verification

**Files:**

- Modify: `client/tests/game-screen/GameScreen.test.tsx`
- Modify: `client/src/styles/game-screen.css`

- [ ] **Step 1: Write failing CSS contracts**

Assert the Codex desktop geometry and mobile adaptation:

```text
desktop outer grid: minmax(360px, 1.7fr) minmax(650px, 2.3fr)
scenario grid: 44px minmax(0, 1fr) 24px
metric grid: three compact metrics plus one wide progress metric
progress uses gold filled segments
mobile hides scenario, capacity, progress, and desktop details
mobile metrics reduce to two equal columns
```

- [ ] **Step 2: Run the suite and verify RED**

Run: `npm run test:game-screen`

Expected: the current approximate selectors and proportions fail the new contracts.

- [ ] **Step 3: Port the relevant Codex CSS values**

Copy the status-panel geometry, catastrophe cell, metric typography, and progress segments from `feature/new-design-codex:client/src/screens/GameScreen.css`, renaming selectors only to the existing `gs-*` scope. Keep the approved mobile two-cell rules.

- [ ] **Step 4: Run automated verification**

Run `npm run test:game-screen`, `npm -w client run build`, Prettier check, and `git diff --check`.

Expected: all commands exit successfully.

- [ ] **Step 5: Run responsive visual QA**

Inspect an active game at 1920×1080 and compare the strip against the supplied reference. Verify 320×700 and 390×844 show only timer and round with no horizontal overflow.
