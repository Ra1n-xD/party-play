# Card Game UX And Concurrent Durak Flow Design

## Scope

Improve the active UNO, Durak, Bunker, home catalog, and shared rules surfaces without changing unrelated platform architecture. The work stays server-authoritative, keeps existing room/session contracts, and does not add dependencies, routes, deployment changes, automated tests, or Git mutations.

## Card Game Layout

UNO and Durak remove the large status panel directly below the shared room header. The remaining layout begins with the player strip, followed by the table and the local hand. A fixed bottom command dock contains game actions, compact phase feedback, spectator state, and host room management.

At desktop widths from 1200 px upward, hand and table cards, player names, counts, and table labels become visibly larger. Existing mobile breakpoints retain compact cards and horizontal hand scrolling. The fixed dock reserves safe-area-aware page padding so it never covers the hand.

Each player card uses a high-contrast card-count badge. The timed/current actor uses a gold border with a red-gold glow. The turn timer is rendered inside that player card. Order numbers and instructional role tags such as “Атакует”, “Защищается”, “Подкидывает 1-м”, and “Ход” are removed. Host, dealer, bot, connection, and inactive-state information remains available.

## Card Interaction And Motion

Cards are played through drag-and-drop or double activation. UNO sends a legal card on double-click and retains drag-to-discard. Durak uses a single click only for selecting a same-rank opening group; double-click sends the selected group or the clicked card. During defense, double-click sends a card only when it has exactly one legal uncovered target; multiple targets require drag-and-drop to a specific attack card. Keyboard activation remains supported through the card button.

The explicit Durak “Атаковать” and “Подкинуть” submission buttons are removed. Required non-card actions such as “Взять”, “Бито”, UNO draw/end-turn/UNO declarations, and host management remain in the bottom dock.

New public table cards animate from the player card that supplied them. The client compares consecutive authoritative snapshots, finds the source player by seat id (or the previous UNO actor), measures the final card, and applies a transform from the source player card to the final table location. Reduced-motion users receive the final state without flight animation. Existing drag settle/invalid-return behavior remains unchanged.

## Durak Trump

The face-up trump card is rendered only while `trumpCardLocation` is `deck`. Once it is drawn, the deck panel keeps the trump suit and replaces the exposed card with a compact status: “Козырь забран” and, when public state identifies the holder, the player name. Table, discard, removed, and unavailable locations receive truthful compact labels without continuing to show a card under an empty deck.

## Concurrent Durak Fight

The opening attack still belongs to the primary attacker. After the opening cards land, the fight enters a shared defense stage:

- the defender may cover any uncovered attack repeatedly without yielding control after each card;
- every active non-defender that has not passed may throw a legal rank at any time;
- room command serialization remains the concurrency boundary, so the first command accepted within the remaining table capacity wins;
- a command exceeding the remaining capacity is rejected with “Стол уже заполнен”, leaving the card in the hand and allowing the existing invalid-drop return motion;
- “Бито” marks one attacker as finished for the current fight and prevents that seat from throwing again;
- when all attackers have passed and every attack is covered, the fight resolves to discard;
- when the maximum attack count is reached, no more passes are required and the fight resolves as soon as every attack is covered;
- after “Взять”, the defender stops covering while non-defenders may throw until everyone passes or the capacity is full, then all table cards move to the defender.

The public `currentActorSeatId` remains a timer/attention owner rather than an authorization gate during the shared stage. It is the defender while defense is possible and the primary attacker after take is declared. A newly accepted attack or defense restarts the appropriate configured decision interval. On timeout, an uncovered defender takes; a fully covered table resolves as defended; and a take-declared fight resolves as taken.

Bot scheduling scans every bot seat with a non-wait legal action instead of only the timer owner. It schedules one serialized bot command at a time, then republishes and rescans. This preserves deterministic room mutation while allowing human and bot throwers to be simultaneously eligible.

Durak rule copy is updated to describe simultaneous throwing, per-player “Бито”, the six-card/initial-hand limit, and first-accepted capacity behavior.

## Home And Rules

Catalog buttons display “Создать комнату” and expose matching accessible names. The hero becomes compact with heading “Выберите игру” and description “Создайте комнату или войдите по коду”. The personal Telegram link is labelled “Сообщить об ошибке”; the Telegram channel and Twitch labels remain distinct.

The shared rules modal increases summary, facts, section descriptions, list items, and tips typography while preserving its current responsive structure and scroll behavior.

## Bunker Controls

Bunker gameplay keeps navigation controls (rules, reactions, leave), player-card detail buttons, candidate selection, tabs, and modal-local buttons where they belong. Game commands and host management live in the fixed bottom command bar. The reconnect host banner is removed from active Game and Vote screens; the bottom management action displays pending recovery attention. Vote-screen host management and special-action controls also move out of the top/status content into the bottom dock.

## Error Handling And Accessibility

Server rejections continue through the existing room command result path and visible error toast. Card buttons expose double-click instructions through labels/descriptions, DnD announcements remain live, and keyboard users can activate legal cards. Fixed docks respect safe-area insets and reduced motion disables new flight animation.

## Verification

Repository rules prohibit creating, changing, or running automated tests for this task. Verification consists of targeted Prettier checks, `npm run build`, `git diff --check`, source scans for removed UI labels, and Browser QA at 1440×900 plus a mobile viewport. Browser scenarios cover home/rules, UNO play and DnD, Durak defense without turn handoff, simultaneous throw eligibility across separate player tabs, capacity rejection, trump pickup display, bottom controls, current-player timer/count emphasis, animations, and Bunker Game/Vote controls.
