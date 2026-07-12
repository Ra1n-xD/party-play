# Game Screen Layout Refinement Design

## Goal

Refine only the active Bunker game screen so it uses the available desktop space, has a compact mobile layout, and consistently follows the green-and-gold visual language of the new design. Existing game logic, state, event handlers, phase flow, and user scenarios remain unchanged.

## Scope

- Keep the current component architecture and mobile tab navigation.
- Reuse the existing room, connection, host-control, leave-room, reveal, and scenario handlers.
- Take only the desktop information-strip layout from `feature/new-design-codex`; do not replace the complete game screen with the Codex implementation.
- Change presentation and responsive behavior only.

## Header

The room header remains full-width and sticky but becomes a compact single row approximately 52 pixels tall. It contains the Bunker icon and title, room code, connection state, host settings when available, and leave-room action. The “Протокол выживания” subtitle is removed. All icon actions retain touch targets of at least 44 by 44 pixels.

## Desktop Layout

The game screen uses the full viewport width with 16–24 pixel side padding instead of a centered 1200-pixel container. The desktop workspace keeps the current player-board and personal-dossier components, with the dossier as a bounded sticky side column. The player board receives the remaining width and uses an auto-fitting grid with a target card width around 280–320 pixels, allowing three to five player cards per row depending on viewport width.

## Information Strip

Desktop adopts the information hierarchy from the Codex design:

- scenario summary;
- countdown timer;
- bunker capacity;
- current round;
- reveal progress.

The strip is one cohesive surface composed of compact metric cards. Existing values and handlers supply all content. Scenario details continue to use the current expandable scenario component and do not introduce new state or game behavior.

On viewports up to 768 pixels, the top information area shows only the countdown timer and current round in a single compact row. Scenario, bunker capacity, reveal progress, catastrophe details, and bunker cards remain available through the existing “Ситуация” mobile tab. No additional menu or duplicate scenario control is introduced.

## Player State Differentiation

The local player and current-turn player must use distinct visual signals:

- local player: gold border or inset marker plus the existing “Вы” label;
- current turn: green border/glow plus the existing current-turn status text;
- when both states apply, the gold local-player marker remains visible while the outer green current-turn treatment takes precedence.

Eliminated and disconnected treatments continue to work as they do now.

## Mobile Actions

When both reveal actions are present, they use two equal columns and identical minimum height. Labels may wrap to two lines without changing either button’s width or height. A single available action spans the entire action bar. Safe-area padding and the existing click handlers remain unchanged.

## Color System

All generic purple surfaces, borders, focus rings, progress indicators, action buttons, modal surfaces, and host controls inside the game screen move to the scoped green-and-gold theme:

- page: `#07100c`;
- surface: `#101713`;
- raised surface: `#141b17`;
- gold/self/primary action: `#efbd58`;
- green/current turn/connected: `#76c69e`;
- danger: `#d9786c`;
- primary text: `#f3f1e8`;
- muted text: `#8e9991`.

Attribute-category accent colors remain distinct where they carry information, but the generic action-card purple accent is replaced with the gold theme color.

## Desktop Host Controls

On desktop, the host-control dialog becomes a centered, wide panel sized to approximately 900–1040 pixels with a constrained viewport height. Operation groups use a two-column grid, while the danger zone spans the full width. The header remains visible during dialog scrolling. Controls have consistent widths, spacing, and green-and-gold states. Mobile keeps the current bottom-sheet presentation and switches operation groups back to one column.

## Accessibility and Responsive Constraints

- Interactive controls remain at least 44 by 44 pixels.
- Keyboard focus is clearly visible in gold.
- No horizontal page overflow at 320, 390, 768, 1280, or 1920 pixels.
- The compact header remains one row at supported widths; connection copy may collapse to an icon and may be hidden at 360 pixels or below.
- Reduced-motion behavior remains supported.

## Verification

- Add source and CSS contract tests before implementation for the full-width desktop layout, Codex-derived information strip, equal mobile actions, player-state differentiation, compact header, and desktop admin grid.
- Run `npm run test:game-screen` and observe each new contract fail before implementation, then pass afterward.
- Run `npm -w client run build`.
- Run Prettier checks on changed files and `git diff --check`.
- Visually inspect the active game screen at 320 and 390 pixels, plus desktop widths of at least 1280 and 1920 pixels.

## Out of Scope

- Changes to server behavior or shared types.
- New game actions, phase logic, state, or event handlers.
- Changes to lobby, voting, results, or home screens.
- A wholesale transfer of the `feature/new-design-codex` game screen.
