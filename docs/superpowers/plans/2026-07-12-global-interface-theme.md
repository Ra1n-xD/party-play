# Global Interface Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the remaining purple PartyPlay shell with the approved dark green, graphite, amber, success, and danger palette while preserving semantic characteristic and external brand colors.

**Architecture:** Keep all React markup and behavior unchanged. Use `global.css` as the single global theme source, update its root tokens first, then replace component-specific legacy literals; protect `game-screen.css` as the authoritative scoped GameScreen theme and verify shared selectors against its existing tests.

**Tech Stack:** React 18, TypeScript, CSS, Node test runner, Vite, Prettier

## Global Constraints

- Preserve all existing layouts, component behavior, handlers, game state, and user flows.
- Keep `game-screen.css` local `--gs-*` overrides structurally unchanged.
- Preserve semantic colors: profession `#fbbf24`, biology `#fb923c`, health `#f87171`, hobby `#34d399`, baggage `#60a5fa`, fact `#22d3ee`, action `#c084fc`.
- Preserve Telegram `#26a5e4`, Twitch `#9146ff`, and donation `#f57b22` brand colors.
- Preserve all pre-existing staged and unstaged user changes.
- Do not commit implementation files automatically because `global.css` and the game-screen test already contain earlier uncommitted interface work.

---

### Task 1: Global theme regression contract

**Files:**

- Create: `client/tests/theme/GlobalTheme.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: raw text from `client/src/styles/global.css` and `client/src/components/CardImage.tsx`.
- Produces: the `npm run test:theme` command and CSS contract for later tasks.

- [ ] **Step 1: Add a failing theme test**

Create a Node test that reads the two source files and asserts the approved tokens and representative shells:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../../src/styles/global.css", import.meta.url), "utf8");
const cardImageSource = readFileSync(
  new URL("../../src/components/CardImage.tsx", import.meta.url),
  "utf8",
);

test("global shell uses the command-center palette", () => {
  assert.match(css, /:root \{[^}]*--bg-primary: #07100c;[^}]*--bg-secondary: #101713;/s);
  assert.match(
    css,
    /:root \{[^}]*--accent: #efbd58;[^}]*--danger: #d9786c;[^}]*--success: #76c69e;/s,
  );
});

test("primary controls and shared surfaces use amber and graphite", () => {
  assert.match(css, /\.btn-primary \{[^}]*#f3c66b[^}]*#dda94a[^}]*color: #17150e;/s);
  assert.match(css, /\.modal \{[^}]*background: rgba\(16, 23, 19, 0\.97\);/s);
  assert.match(css, /\.particle \{[^}]*rgba\(118, 198, 158, 0\.7\)/s);
});

test("legacy purple shell colors are removed while semantic colors remain", () => {
  assert.doesNotMatch(css, /#8b5cf6|#7c3aed|#6d28d9|#a855f7|rgba\(139, 92, 246|rgba\(168, 85, 247/);
  assert.match(css, /#c084fc/);
  assert.match(css, /#26a5e4/);
  assert.match(css, /#9146ff/);
  assert.match(cardImageSource, /action:[\s\S]*color: "#c084fc"/);
});
```

- [ ] **Step 2: Add the reusable script**

Add to root `package.json`:

```json
"test:theme": "TSX_TSCONFIG_PATH=client/tsconfig.json node --import tsx --test client/tests/theme/GlobalTheme.test.ts"
```

- [ ] **Step 3: Run the test and verify RED**

Run: `npm run test:theme`

Expected: FAIL because the root and shared shell still use the legacy purple palette.

### Task 2: Theme tokens and shared controls

**Files:**

- Modify: `client/src/styles/global.css:1-592`
- Modify: `client/src/components/CardImage.tsx:200-204`
- Test: `client/tests/theme/GlobalTheme.test.ts`

**Interfaces:**

- Consumes: the regression contract from Task 1.
- Produces: approved global tokens used by every later screen-specific selector.

- [ ] **Step 1: Replace root tokens**

Use the exact foundation:

```css
:root {
  --bg-primary: #07100c;
  --bg-secondary: #101713;
  --bg-card: rgba(16, 23, 19, 0.82);
  --bg-card-hover: rgba(20, 27, 23, 0.94);
  --text-primary: #f3f1e8;
  --text-secondary: #b7c0ba;
  --text-muted: #7f8b83;
  --accent: #efbd58;
  --accent-hover: #f6d181;
  --accent-glow: rgba(239, 189, 88, 0.26);
  --danger: #d9786c;
  --danger-hover: #e49183;
  --success: #76c69e;
  --info: #6aa7d2;
  --warning: #efbd58;
  --border: rgba(178, 199, 185, 0.14);
  --border-light: rgba(178, 199, 185, 0.24);
  --glass: rgba(16, 23, 19, 0.76);
  --glass-border: rgba(178, 199, 185, 0.18);
}
```

Keep existing radius and shadow tokens.

- [ ] **Step 2: Recolor the shared shell and controls**

Update the body lighting, sticky bars, normal timer, logo, footer surface, inputs, primary buttons, action buttons, selection states, and pulse glows to use amber/green/graphite literals. Primary buttons must use:

```css
background: linear-gradient(135deg, #f3c66b, #dda94a);
color: #17150e;
```

Keep danger buttons red and branded footer icon colors unchanged.

- [ ] **Step 3: Align the semantic action image**

Change only the action entry in `CARD_CONFIG`:

```ts
action: {
  color: "#c084fc",
```

- [ ] **Step 4: Run the theme test**

Run: `npm run test:theme`

Expected: it may still fail on screen-specific legacy purple literals, but root token and action-image assertions pass.

### Task 3: Home, Lobby, Vote, and Results surfaces

**Files:**

- Modify: `client/src/styles/global.css:290-760`
- Modify: `client/src/styles/global.css:1299-1668`
- Test: `client/tests/theme/GlobalTheme.test.ts`

**Interfaces:**

- Consumes: global theme tokens from Task 2.
- Produces: consistent non-game screens without changing React components.

- [ ] **Step 1: Recolor Home and Lobby**

Use amber for `.logo h1`, `.lobby-header h2`, `.room-code-value`, `.player-item.is-me`, `.player-number`, `.host-badge`, and `.me-badge`. Use graphite surfaces and green-grey borders for `.home-footer`, `.input`, `.room-code-display`, and `.player-item`. Keep `.ready-status.ready` green, bot identity cyan, and branded footer colors unchanged.

- [ ] **Step 2: Recolor Vote**

Use graphite for `.sticky-top-bar`, `.vote-waiting-card`, `.vote-candidate`, and progress tracks. Use amber for normal timers, progress fills, selections, and neutral host controls. Keep `.btn-vote` and vote bars danger red; keep accepted votes green.

- [ ] **Step 3: Recolor Results**

Use an amber-to-green heading treatment for `.results-container h2`, graphite result cards, amber current-player borders, green survivor states, muted red eliminated states, and green-grey borders for bunker/threat/vote sections. Preserve semantic attribute label colors.

- [ ] **Step 4: Run the theme test**

Run: `npm run test:theme`

Expected: screen assertions pass; any remaining failure names a legacy purple global overlay selector.

### Task 4: Modals, overlays, notifications, and particles

**Files:**

- Modify: `client/src/styles/global.css:1669-2184`
- Modify: `client/src/styles/global.css:2260-2395`
- Test: `client/tests/theme/GlobalTheme.test.ts`

**Interfaces:**

- Consumes: global tokens and screen surfaces from Tasks 2-3.
- Produces: consistent global siblings that appear over GameScreen and other phases.

- [ ] **Step 1: Recolor generic modal and host controls**

Use `rgba(16, 23, 19, 0.97)` for `.modal`, graphite/amber treatments for legacy `.admin-panel`, `.btn-admin-toggle`, `.btn-admin`, and `.admin-chip.active`, and keep danger actions red.

- [ ] **Step 2: Recolor pause and phase announcements**

Use near-black green backdrops and amber-to-green title gradients. Do not change animations, duration, stacking, or pointer-event behavior.

- [ ] **Step 3: Recolor reveal overlays and toasts**

Make the reveal-card shell graphite while retaining each `--card-accent` category and its translucent border. Keep `#c084fc` only for action-card semantic selectors. Make `.action-toast` green/amber and keep `.error-toast` muted red.

- [ ] **Step 4: Recolor particles, app version, and spectator state**

Use green particles based on `rgba(118, 198, 158, ...)`, graphite version background, and green spectator badge. Keep bot cyan and external brands unchanged.

- [ ] **Step 5: Run both regression suites**

Run:

```bash
npm run test:theme
npm run test:game-screen
```

Expected: both suites report 0 failures.

### Task 5: Responsive and production verification

**Files:**

- Verify: `client/src/styles/global.css`
- Verify: `client/src/styles/game-screen.css`
- Verify: `client/src/components/CardImage.tsx`
- Verify: `client/tests/theme/GlobalTheme.test.ts`

**Interfaces:**

- Consumes: the complete global theme.
- Produces: verified desktop/mobile presentation with no behavioral changes.

- [ ] **Step 1: Run automated verification**

Run:

```bash
npm run test:theme
npm run test:game-screen
npm -w client run build
npx prettier --check package.json client/src/styles/global.css client/src/components/CardImage.tsx client/tests/theme/GlobalTheme.test.ts docs/superpowers/plans/2026-07-12-global-interface-theme.md
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Visually inspect representative states**

At desktop and mobile widths, inspect Home, Lobby, Vote, Results, a generic modal, pause/phase overlay, reveal overlay, and particles. Confirm the shell contains no legacy purple styling, semantic characteristic colors remain distinct, branded footer colors remain intact, and there is no horizontal overflow.

- [ ] **Step 3: Review scope**

Use `git diff --name-only` and `git diff` to confirm there are no changes to context state, socket events, handlers, phase routing, or server files. Preserve unrelated staged changes.
