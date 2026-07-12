# Player Cards and Bunker Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make eliminated players unmistakable, compact public characteristics into two columns with desktop images, and flatten the bunker section into one container without repeated capacity.

**Architecture:** Keep `PlayerBoard` and `ScenarioDetails` as the existing rendering boundaries. Add only presentational markup for the existing `CardImage` component and scope all responsive behavior to `game-screen.css`; do not alter state or event flow.

**Tech Stack:** React 18, TypeScript, CSS, Node test runner, Vite

## Global Constraints

- Refine only the Bunker game screen presentation.
- Do not change game state, socket events, handlers, phase logic, or user flows.
- Preserve all pre-existing staged and unstaged user changes in the shared files.
- Do not commit the implementation files automatically because they already contain earlier uncommitted interface work.

---

### Task 1: Compact public player characteristics

**Files:**

- Modify: `client/src/screens/game/PlayerBoard.tsx`
- Modify: `client/src/styles/game-screen.css`
- Test: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: `CardImage({ type, className })`, `PlayerInfo.revealedAttributes`, and `PlayerInfo.actionCard`.
- Produces: `.gs-public-attribute-icon`, `.gs-public-attribute-copy`, and a strict two-column `.gs-public-attributes` grid.

- [ ] **Step 1: Write the failing rendering and CSS assertions**

Add assertions that rendered public attributes include `gs-public-attribute-icon`, that the source imports `CardImage`, and that CSS contains:

```css
.command-game-screen .gs-public-attributes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 768px) {
  .command-game-screen .gs-public-attribute-icon {
    display: none;
  }
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test:game-screen`

Expected: FAIL because player board images and the strict two-column grid are absent.

- [ ] **Step 3: Add existing images to each public characteristic**

Import `CardImage` and render it for both normal and action attributes:

```tsx
<CardImage type={attribute.type} className="gs-public-attribute-icon" />
<span className="gs-public-attribute-copy">
  <span>{attribute.label}</span>
  <strong>{attribute.value}</strong>
</span>
```

Use `type="action"` and `player.actionCard.title` for the revealed action card.

- [ ] **Step 4: Implement the strict two-column responsive styles**

Replace the wrapping flex behavior with a two-column grid, lay desktop cells out as image plus copy, and hide the image inside the existing `max-width: 768px` media query. Keep `min-width: 0` and natural wrapping for long Russian values.

- [ ] **Step 5: Make eliminated cards dark but keep their status readable**

Remove eliminated cards from the shared opacity rule used by disconnected cards. Give `.gs-player-card.is-eliminated` a near-black background, subdued danger border/inset accent, dim only the heading and attribute grid, and give its first state pill a contrasting danger treatment.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `npm run test:game-screen`

Expected: 0 failed tests.

### Task 2: Flatten the bunker information section

**Files:**

- Modify: `client/src/screens/game/ScenarioSummary.tsx`
- Modify: `client/src/styles/game-screen.css`
- Test: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: existing `ScenarioDetails` props and status-strip capacity values.
- Produces: one outer bunker boundary with no `.gs-bunker-capacity` element.

- [ ] **Step 1: Write the failing rendering and CSS assertions**

Assert that `ScenarioDetails` does not render `Мест в бункере:` or `gs-bunker-capacity`, while the higher-level summary still renders `Мест: 2`. Assert that `.gs-bunker-details` uses `background: transparent`, `border: 0`, and `border-radius: 0`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test:game-screen`

Expected: FAIL because the repeated capacity line and inner bunker border still exist.

- [ ] **Step 3: Remove repeated capacity markup**

Delete only:

```tsx
<p className="gs-bunker-capacity">Мест в бункере: {gameState.bunkerCapacity}</p>
```

Do not alter `GameStatusHeader` or the mobile summary metadata.

- [ ] **Step 4: Remove the inner bunker surface**

Keep the existing outer `.gs-desktop-situation-details` and `.gs-scenario` boundaries. Make `.gs-bunker-details` transparent and borderless, remove its left accent, and retain compact padding for the title and card grid.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm run test:game-screen`

Expected: 0 failed tests.

### Task 3: Responsive and production verification

**Files:**

- Verify: `client/src/screens/game/PlayerBoard.tsx`
- Verify: `client/src/screens/game/ScenarioSummary.tsx`
- Verify: `client/src/styles/game-screen.css`
- Verify: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: the completed player and bunker presentation changes.
- Produces: verified desktop/mobile UI with no logic changes.

- [ ] **Step 1: Run automated verification**

Run:

```bash
npm run test:game-screen
npm -w client run build
npx prettier --check client/src/screens/game/PlayerBoard.tsx client/src/screens/game/ScenarioSummary.tsx client/src/styles/game-screen.css client/tests/game-screen/GameScreen.test.tsx
git diff --check
```

Expected: every command exits 0 and the game-screen suite reports 0 failures.

- [ ] **Step 2: Inspect responsive rendering**

At desktop width, confirm every public characteristic has an image, two characteristics share each row, eliminated cards are clearly darker, and the bunker has one outer border. At mobile width, confirm images are hidden, two characteristics remain per row without horizontal overflow, the bunker still has one outer border, and capacity remains in the summary metadata only.

- [ ] **Step 3: Review scope**

Use `git diff` to confirm there are no edits to socket events, handlers, state transitions, or server files. Preserve all unrelated staged changes.
