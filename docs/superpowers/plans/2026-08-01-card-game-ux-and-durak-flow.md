# Card Game UX And Concurrent Durak Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the requested PartyPlay card-game sizing, interaction, control placement, animation, concurrent Durak fight, home, Bunker, and rules improvements.

**Architecture:** Preserve existing game modules and server-authoritative room command execution. Extend Durak authorization from a single turn actor to role-based legal actions during a fight, and build the UI changes inside the existing game-specific screens plus shared platform components.

**Tech Stack:** TypeScript, React, CSS, Socket.IO room snapshots, npm workspaces, Vite.

## Global Constraints

- Never stage, commit, push, branch, merge, rebase, reset, restore, stash, or clean.
- Do not create, modify, or run automated tests.
- Do not add dependencies or perform unrelated refactors.
- Keep multiplayer state, capacity validation, timers, and bot commands server-authoritative.
- Preserve mobile interaction, accessible controls, reduced motion, reconnect, spectator, and host-management behavior.
- Verify with targeted formatting, build, diff checks, and manual Browser scenarios only.

---

### Task 1: Concurrent Durak State And Legal Actions

**Files:**

- Modify: `server/src/games/durak/runtime.ts`
- Modify: `server/src/games/durak/engine.ts`
- Modify: `server/src/games/durak/projections.ts`
- Modify: `shared/games/durak/types.ts`

**Interfaces:**

- Consumes: existing `DurakCommand`, `DurakFight`, `executeInRoom` serialization, and room snapshots.
- Produces: role-based `getDurakLegalAction`, concurrent `applyDurakCommand`, and timer-owner public state without adding a new socket command.

- [ ] **Step 1: Replace sequential throw cursor transitions with shared-fight helpers**

Add helpers that return eligible throwers, determine whether all throwers passed, determine whether capacity is full, restart the timer owner, and resolve the fight only when the covered/taken completion conditions are true. Remove `throwCursor` from runtime state and invariants.

- [ ] **Step 2: Authorize commands by fight role**

Keep opening attack restricted to the primary attacker. Permit defender commands during defense and permit throw/pass commands from every unpassed non-defender during defense or take-throw-in. Reject overflow using the exact message `Стол уже заполнен`.

- [ ] **Step 3: Keep defense active across multiple cards**

After a successful defense, keep the defender as timer owner while uncovered cards remain. If the table is covered, resolve immediately only when capacity is full or every thrower passed; otherwise leave the shared throw window open.

- [ ] **Step 4: Update timeout and invariant behavior**

Timeout uncovered defense to take, covered defense to discard, and take-throw-in to taken resolution. Assert timer owner, passed-seat membership, capacity, card conservation, and stage consistency without assuming a sequential cursor.

- [ ] **Step 5: Project legal actions for every eligible seat**

Return defend/take for the defender, throw-in/pass for each unpassed thrower, attack for the opening actor, and wait otherwise. Keep the existing private-state union so all consumers remain typed.

### Task 2: Concurrent Durak Bot Scheduling And Rules

**Files:**

- Modify: `server/src/games/durak/module.ts`
- Modify: `server/src/games/durak/bot.ts` only if selection needs a small compatibility adjustment
- Modify: `client/src/games/durak/rules.ts`

**Interfaces:**

- Consumes: `buildDurakPrivateState` for every active bot seat.
- Produces: one serialized scheduled command from the next bot with a legal action and rule copy matching the engine.

- [ ] **Step 1: Scan actionable bots instead of only the timer owner**

Build a bounded list of active bot-controlled seats whose private legal action is not `wait`, select one deterministically from seat order, and retain the existing natural delay, revision, controller-epoch, and game-instance guards.

- [ ] **Step 2: Preserve one room bot timer**

Schedule one bot command, publish the result, and allow the normal publish/reschedule cycle to select the next bot. Do not introduce parallel mutation timers.

- [ ] **Step 3: Update Durak rules**

Describe simultaneous throwing, repeated defense without yielding, per-attacker “Бито”, the attack limit, and first-accepted capacity behavior in the existing Russian rules sections.

### Task 3: Shared Table-Flight Motion And Card Activation

**Files:**

- Create: `client/src/games/shared/useTableCardFlight.ts`
- Modify: `client/src/games/shared/card-motion.css`
- Modify: `client/src/games/durak/components/DurakCard.tsx`
- Modify: `client/src/games/uno/components/UnoCard.tsx`

**Interfaces:**

- Produces: `useTableCardFlight({ revision, flights })`, where each flight supplies a stable key, source seat id, and target element selector/data id.
- Consumes: player elements marked with `data-card-player-seat` and final card elements marked with `data-table-card-flight`.

- [ ] **Step 1: Implement authoritative snapshot flight detection**

Use a layout effect to compare stable flight keys, measure the source player and final card, apply CSS custom properties for the source delta, and add/remove an animation class on newly observed final cards. Ignore the initial snapshot and clean up animation listeners/timeouts.

- [ ] **Step 2: Add reduced-motion-safe flight CSS**

Animate transform, opacity, and scale from the player card center to the final card in roughly 300 ms. Disable the animation in `prefers-reduced-motion: reduce`.

- [ ] **Step 3: Support double activation in card components**

Add explicit `onDoubleClick` and keyboard activation props without turning disabled or purely visual cards into interactive controls. Preserve existing DnD click suppression and accessible names.

### Task 4: Durak Screen And Responsive Visuals

**Files:**

- Modify: `client/src/games/durak/DurakGameScreen.tsx`
- Modify: `client/src/games/durak/durak.css`

**Interfaces:**

- Consumes: concurrent legal actions, timer-owner player state, `useTableCardFlight`, existing `useCardDrag`.
- Produces: player-first layout, bottom command dock, double-click/DnD card play, truthful trump status, and desktop card scaling.

- [ ] **Step 1: Remove the top status panel and reconnect action banner**

Move phase feedback, spectator state, host management, and pending recovery count into the bottom dock. Render `Timer` inside the current player card.

- [ ] **Step 2: Simplify player cards**

Remove order numbers and turn-role instructional tags. Mark player elements by seat id, retain host/dealer/connectivity data, emphasize current actor, and render card counts as high-contrast badges.

- [ ] **Step 3: Make card play DnD/double-click based**

Retain single-click group selection for same-rank opening cards, remove attack/throw submission buttons, send the selected group on double-click, and auto-defend only for one legal target. Keep `Взять` and `Бито` in the dock.

- [ ] **Step 4: Fix trump rendering**

Show the face-up card only while its location is `deck`; otherwise show a suit/status placeholder and holder name when available.

- [ ] **Step 5: Attach table-flight markers**

Mark every attack and defense final card with a unique flight key and pass its played-by seat id to the shared flight hook.

- [ ] **Step 6: Scale desktop UI and reserve dock space**

Increase cards and key typography for 1200 px and wider screens, keep existing compact mobile overrides, and ensure the fixed dock does not obscure horizontally scrollable hands.

### Task 5: UNO Screen And Responsive Visuals

**Files:**

- Modify: `client/src/games/uno/UnoGameScreen.tsx`
- Modify: `client/src/games/uno/uno.css`

**Interfaces:**

- Consumes: previous/current UNO snapshot actors, `useTableCardFlight`, and existing drag-to-discard.
- Produces: player-first layout, bottom command dock, double-click card play, source-player discard animation, and desktop card scaling.

- [ ] **Step 1: Remove the top status panel and reconnect action banner**

Move compact state, host management, pending recovery attention, and special actions into a fixed bottom dock. Render the turn timer inside the current player card.

- [ ] **Step 2: Simplify and emphasize player cards**

Remove order numbers and the `Ход` tag, retain host/dealer/connectivity data, mark seat sources, emphasize the current actor, and strengthen card-count badges.

- [ ] **Step 3: Switch legal card play to double-click plus DnD**

Use double-click for immediate legal play while preserving color choice, risk confirmation, keyboard activation, draw, end-turn, UNO declarations, and drag-to-discard.

- [ ] **Step 4: Animate discard from the previous actor**

Track the previous snapshot actor when the top discard changes, mark the final discard card, and trigger a flight from that player card.

- [ ] **Step 5: Scale desktop UI and reserve dock space**

Increase desktop card/table/player typography without changing narrow/mobile sizes or hand containment.

### Task 6: Home, Shared Rules, And Bunker Controls

**Files:**

- Modify: `client/src/platform/screens/HomeScreen.tsx`
- Modify: `client/src/styles/global.css`
- Modify: `client/src/screens/GameScreen.tsx`
- Modify: `client/src/screens/VoteScreen.tsx`
- Modify: `client/src/screens/game/GameCommandBar.tsx`
- Modify: `client/src/styles/game-screen.css`

**Interfaces:**

- Produces: compact home copy, correct create-room labels, larger rule typography, and bottom-only Bunker game/host command placement.

- [ ] **Step 1: Update home labels and hero copy**

Change the personal Telegram label to `Сообщить об ошибке`, catalog buttons and aria labels to `Создать комнату`, heading to `Выберите игру`, description to `Создайте комнату или войдите по коду`, and reduce hero spacing/font size.

- [ ] **Step 2: Increase shared rule typography**

Raise summary, facts, section body, list item, and tips sizes at desktop and mobile without overflowing the modal.

- [ ] **Step 3: Consolidate Bunker active-game controls**

Remove active reconnect banners from Game and Vote screens. Pass recovery attention into `GameCommandBar`, keep Game actions fixed at the bottom, and move Vote host/special-action buttons into a fixed bottom action dock while leaving candidate selection and modal buttons contextual.

### Task 7: Verification And Requirement Audit

**Files:**

- Inspect every file changed by Tasks 1–6.

**Interfaces:**

- Produces: fresh evidence mapped to every user requirement.

- [ ] **Step 1: Format changed files only**

Run targeted `npx prettier --write` on the changed TypeScript, TSX, CSS, and Markdown files, then targeted `npx prettier --check` on the same list.

- [ ] **Step 2: Run static verification**

Run `npm run build` and `git diff --check`. Do not run any automated test command.

- [ ] **Step 3: Run source-contract scans**

Confirm removed top status panels, attack submission buttons, player order/turn-role labels, old home labels, and top Bunker admin triggers are absent from active paths. Confirm rules describe the new Durak behavior.

- [ ] **Step 4: Run Browser desktop scenarios**

At 1440×900, verify home and rules, create UNO/Durak/Bunker rooms with bots, inspect card/font scaling, bottom docks, timer/count/current-player emphasis, trump display, double-click/DnD, and table-flight motion. Use separate Durak player tabs where possible to verify concurrent eligibility and first-accepted capacity behavior.

- [ ] **Step 5: Run Browser mobile scenarios**

At a 390 px wide viewport, verify hand scrolling, bottom dock safe areas, readable player/count state, DnD containment, modal rule typography, and Bunker command access.

- [ ] **Step 6: Audit all numbered requirements**

Map each original card-game, home, Bunker, and rules item to source and runtime evidence. Report anything not verified as a limitation instead of claiming it complete.
