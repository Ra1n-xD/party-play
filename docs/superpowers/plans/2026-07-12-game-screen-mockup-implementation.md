# Game Screen Mockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild only `GameScreen` to match the supplied desktop and mobile mockups while preserving every existing game action, permission check, server contract, and phase transition.

**Architecture:** Keep `GameScreen` connected to `GameContext`, extract only pure presentation mapping into `gameScreenView.ts`, and render one unified player-card grid from existing public/private data. Add a scoped `GameScreen.css` so other screens retain their current design.

**Tech Stack:** React 18, TypeScript 5.6, Vite 5, React Icons, Node built-in test runner through the already installed `tsx` loader.

## Global Constraints

- Change only `GameScreen`, its presentation helper/test, and its scoped stylesheet.
- Do not modify `GameContext`, Socket.IO events, server code, shared types, phase routing, or game rules.
- Do not add actions that lack an existing handler.
- Never expose `myCharacter` data in another player's card.
- Preserve all current host operations, reveal confirmations, player-detail modal behavior, spectator restrictions, and error display.
- Desktop at 1200 px and above uses four player columns; mobile at 768 px and below uses one.
- The layout must not create horizontal viewport scrolling at 320 px.
- Preserve the user's unrelated deleted `new.png` worktree state.

---

### Task 1: Pure player-card presentation mapping

**Files:**

- Create: `client/src/screens/gameScreenView.ts`
- Create: `client/tests/gameScreenView.test.ts`

**Interfaces:**

- Consumes: `Attribute`, `AttributeType`, `Character`, and `PlayerInfo` from `shared/types.ts`.
- Produces: `ATTRIBUTE_ORDER`, `ATTRIBUTE_LABELS`, `PlayerAttributeSlot`, `buildPlayerAttributeSlots(player, isMe, myCharacter)`, `getInitials(name)`, and `countRevealedCards(players)`.

- [ ] **Step 1: Write the failing mapping tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { Character, PlayerInfo } from "../../../shared/types";
import { buildPlayerAttributeSlots, countRevealedCards, getInitials } from "./gameScreenView";

const player: PlayerInfo = {
  id: "p1",
  name: "Анна Смирнова",
  ready: true,
  connected: true,
  alive: true,
  revealedAttributes: [{ type: "profession", label: "Профессия", value: "Хирург" }],
  actionCardRevealed: false,
  isHost: false,
  isBot: false,
};

const character: Character = {
  attributes: [
    { type: "profession", label: "Профессия", value: "Хирург" },
    { type: "bio", label: "Биология", value: "34 года · женщина" },
    { type: "health", label: "Здоровье", value: "Идеальное здоровье" },
    { type: "hobby", label: "Хобби", value: "Скалолазание" },
    { type: "baggage", label: "Багаж", value: "Полевая аптечка" },
    { type: "fact", label: "Особый факт", value: "Знает три языка" },
  ],
  actionCard: {
    id: "a1",
    title: "Иммунитет",
    description: "Иммунитет к первому изгнанию",
    targetRequired: false,
  },
};

test("public player slots never contain private values", () => {
  const slots = buildPlayerAttributeSlots(player, false, character);
  assert.equal(slots.length, 7);
  assert.equal(slots[0].value, "Хирург");
  assert.equal(slots[1].value, null);
  assert.equal(slots[6].value, null);
});

test("owner slots contain all private values and preserve reveal state", () => {
  const slots = buildPlayerAttributeSlots(player, true, character);
  assert.equal(slots[1].value, "34 года · женщина");
  assert.equal(slots[1].isPublic, false);
  assert.equal(slots[0].isPublic, true);
  assert.equal(slots[6].value, "Иммунитет");
});

test("view counters include revealed action cards", () => {
  assert.equal(countRevealedCards([player, { ...player, id: "p2", actionCardRevealed: true }]), 3);
  assert.equal(getInitials("Анна Смирнова"), "АС");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --import tsx --test client/tests/gameScreenView.test.ts`

Expected: FAIL because `gameScreenView.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure mapping helper**

Implement fixed six-attribute ordering plus the action-card slot. For `isMe === false`, read only `player.revealedAttributes` and `player.actionCard` when `actionCardRevealed` is true. For `isMe === true`, read private values only from `myCharacter`, marking public values by matching `type` and `value` against the player's revealed data.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --import tsx --test client/tests/gameScreenView.test.ts`

Expected: 3 tests pass, 0 fail.

---

### Task 2: Unified mockup-driven GameScreen markup

**Files:**

- Modify: `client/src/screens/GameScreen.tsx`

**Interfaces:**

- Consumes: existing `useGame()` values and callbacks plus Task 1 presentation helpers.
- Produces: scoped `.command-game` DOM structure consumed by Task 3 styles.

- [ ] **Step 1: Establish the markup acceptance check**

Before editing, run:

`rg -n 'command-game-header|command-status-grid|command-player-grid|command-bottom-bar' client/src/screens/GameScreen.tsx`

Expected: no matches.

- [ ] **Step 2: Add existing room actions and display-only calculations**

Destructure `connected`, `roomCode`, and `leaveRoom` from `useGame()`. Compute alive count, opened-card count, action-card count, phase copy, current-turn player, and whether the bottom bar has any existing action. Do not emit socket events or mutate game state directly.

- [ ] **Step 3: Replace duplicated desktop/mobile player lists with one grid**

Render a semantic button for every player. Use `buildPlayerAttributeSlots` and render seven fixed rows, locked placeholders for non-public data, progress marks, status badges, and existing `setExpandedPlayerId(player.id)` behavior. The current player's private slots may be displayed only when `player.id === playerId`.

- [ ] **Step 4: Build the header and status summary**

Render brand, room code, connection, host-control button, and leave button. Render catastrophe, timer, capacity, round, progress, and collapsible bunker/threat details from existing data. The host-control button must keep the current pause/unpause sequence.

- [ ] **Step 5: Preserve all existing modals and admin operations**

Move, but do not rewrite, the current attribute picker, player detail modal, reveal-action confirmation, error toast, admin action forms, and end-game handler. Ensure the admin panel is a dialog/drawer visually while invoking the same callbacks.

- [ ] **Step 6: Build the bottom action bar from existing permissions**

Render only `canReveal`, `canRevealAction`, and host `adminSkipDiscussion` actions. Preserve existing confirmation behavior and `showAttrPicker` branching for round 1.

- [ ] **Step 7: Verify TypeScript integration**

Run: `npm -w client run build`

Expected: TypeScript and Vite complete with exit code 0.

---

### Task 3: Scoped desktop and mobile visual system

**Files:**

- Create: `client/src/screens/GameScreen.css`
- Modify: `client/src/screens/GameScreen.tsx`

**Interfaces:**

- Consumes: `.command-game*` classes from Task 2.
- Produces: mockup-matched layout without changing global styles used by other screens.

- [ ] **Step 1: Import the scoped stylesheet**

Add `import "./GameScreen.css";` to `GameScreen.tsx`.

- [ ] **Step 2: Implement design tokens and desktop layout**

Define local custom properties under `.command-game` for background `#07100c`, panels near `#101713`, border `rgba(178, 199, 185, 0.14)`, primary text `#f3f1e8`, muted text `#8e9991`, gold `#efbd58`, green `#76c69e`, and danger `#d9786c`. Use a maximum content width matching the reference and a four-column player grid at 1200 px and above.

- [ ] **Step 3: Style player cards and attribute slots**

Use compact two-column attribute cells inside each player card, full-width fact/action rows, diagonal locked texture, type-colored icon wells, seven-segment progress, and player-specific accent variables. Maintain readable wrapping for Russian content.

- [ ] **Step 4: Implement tablet and mobile breakpoints**

At 1199 px use two player columns. At 768 px use one column, compact the header/status summary, show the horizontal participant strip, and make the bottom actions safe-area-aware. At 360 px reduce spacing and typography without shrinking interactive targets below 44 px.

- [ ] **Step 5: Style existing dialogs within the new screen scope**

Restyle the admin panel, attribute picker, player detail, confirmation modal, and error toast only when nested under `.command-game`. Keep their stacking order above the fixed action bar.

- [ ] **Step 6: Verify formatting and compilation**

Run: `npm run format`

Run: `npm -w client run build`

Run: `npm -w server run build`

Expected: all commands exit 0.

---

### Task 4: Browser-based visual and interaction verification

**Files:**

- Modify if needed: `client/src/screens/GameScreen.tsx`
- Modify if needed: `client/src/screens/GameScreen.css`

**Interfaces:**

- Consumes: completed local app.
- Produces: verified desktop/mobile UI and a final clean diff.

- [ ] **Step 1: Start the local application**

Run: `npm run dev`

Expected: server listens on port 3001 and Vite on port 5173.

- [ ] **Step 2: Exercise an actual game state**

Open the local app, create a room, add enough bots to start, mark the host ready if required, and start the game using existing controls. Do not alter server state outside visible game controls.

- [ ] **Step 3: Inspect responsive layouts**

Capture and inspect 1440×900, 1024×768, 390×844, and 320 px wide layouts. Confirm four/two/one player columns as specified, no viewport overflow, readable locked cells, and a non-overlapping bottom bar.

- [ ] **Step 4: Exercise preserved interactions**

Verify player-detail opening/closing, host management opening/closing, reveal control availability, action-card confirmation, and leave action. Verify unavailable mockup-only actions are absent.

- [ ] **Step 5: Run final verification**

Run: `node --import tsx --test client/tests/gameScreenView.test.ts`

Run: `npm run build`

Run: `npm run format:check`

Run: `git diff --check`

Expected: tests pass, both workspaces build, formatting is clean, and no whitespace errors are reported.
