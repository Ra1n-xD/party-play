# Player Cards and Bunker Polish Design

## Scope

Refine only the Bunker game screen presentation. Do not change game state, socket events, handlers, phase logic, or user flows.

## Player cards

- Treat the public player board as the target of these changes; the private character dossier remains unchanged.
- Render revealed characteristics in a strict two-column grid at desktop and mobile widths.
- Reuse the existing `CardImage` component for every revealed characteristic and revealed action card on desktop.
- Hide these compact images at mobile widths so two columns remain readable without increasing card height unnecessarily.
- Make eliminated player cards visibly darker than active and disconnected cards. Dim their ordinary content while keeping the `Изгнан` status clear and contrasting.
- Preserve the existing, distinct `is-me` and `is-current-turn` states for active players.

## Bunker information

- Keep a single outer section boundary for the bunker information and remove the inner `gs-bunker-details` surface, border, and accent border.
- Keep the bunker title, revealed bunker cards, and optional threat card inside that single section.
- Remove the repeated `Мест в бункере` line from `ScenarioDetails`; capacity remains available in the status strip and mobile scenario summary.
- Apply the same information structure on desktop and mobile.

## Responsive behavior

- Desktop: two characteristics per row with compact existing card images.
- Mobile: two characteristics per row without card images; values may wrap naturally within their cell.
- The bunker card grid retains its existing responsive behavior.

## Verification

- Add rendering/CSS regression assertions before implementation and confirm they fail for the missing design.
- Run the game-screen tests, the client production build, formatting checks, and `git diff --check`.
- Visually inspect representative desktop and mobile viewports and confirm no horizontal overflow.
