# Card game controls, motion, and responsive layout design

## Goal

Make every active game comfortable from the bottom edge, make Durak and UNO cards easy to hit on desktop, keep every player and every hand card visible on mobile, and make server-authoritative card and action changes visually understandable to every viewer.

## Interaction design

- Remove rules and reaction triggers from `GameRoomHeader` and render one shared `GameDockTools` instance inside each screen's bottom command bar, including result and spectator states.
- Keep leave/connection/room identity in the compact header. Rules stay in the existing accessible dialog; reactions keep their existing eligibility, rate limiting, and live announcements.
- Use a three-column player grid on narrow screens so six players fit in two rows. Names truncate, card-count badges stay visually prominent, and the current actor retains the red/gold treatment and timer.
- Render both private hands as centered fans. Every card remains in one row with overlap derived from hand size; no horizontal card scrolling is used.
- Enlarge desktop table cards and their drop targets. The Durak trump becomes the same footprint as the deck and its rank/suit corner is enlarged.
- Keep UNO draw and discard piles centered as one table unit.

## Public visual events

- Each card game runtime owns a bounded, monotonic public `visualEvents` stream.
- Events expose only seat ids, public action keys, transfer anchors, and card counts. Drawn or held card identities are never exposed.
- The server appends an action event for accepted player commands and transfer events for player-to-table, deck-to-player, table-to-player, table-to-discard, and discard-to-deck changes.
- Clients skip historical events on initial mount, animate only newly observed ids, and show action bubbles beside the responsible player for a short time.
- Visible played cards retain their face-up flight animation. Hidden transfers use neutral card-back ghosts between stable DOM anchors.

## Motion and accessibility

- Motion uses transforms and opacity only and is disabled under `prefers-reduced-motion`.
- Action bubbles use `aria-live` through the existing screen status while remaining concise visual annotations.
- DnD, double-click/click fallback, keyboard cancellation, and invalid-drop return behavior remain unchanged.

## Verification

- Targeted Prettier on changed files.
- `npm run build`, `npm run format:check`, and `git diff --check`.
- In-app browser checks at desktop and mobile widths for Bunker, Durak, and UNO, including bottom controls, six-player layout, centered UNO piles/hand, enlarged DnD targets, action labels, and card transfer motion where a playable flow permits.
- Automated tests are not created, modified, or run per repository instructions.
