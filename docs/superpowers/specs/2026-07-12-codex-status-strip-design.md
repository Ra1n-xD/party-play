# Codex Status Strip Design

## Goal

Replace the current approximate game information strip with the desktop structure and visual proportions from `feature/new-design-codex`, matching the supplied Codex reference as closely as the existing game data permits. Preserve the previously approved compact mobile behavior and all game logic.

## Desktop Structure

The status strip uses the Codex layout directly instead of composing the generic `ScenarioSummary` component:

1. A wide static catastrophe cell containing the red warning icon, uppercase eyebrow, catastrophe title, and description. Desktop does not use an expand interaction, chevron, dropdown, or hidden details.
2. A timer metric with clock icon, contextual label, large gold value, and the current phase description.
3. A bunker-capacity metric with shield icon, `capacity/alive players` value, and supporting copy.
4. A round metric with round icon, `current/total` value, and phase label.
5. A wide reveal-progress metric with title and zero-padded `current round / total rounds` value on one line, followed by one segment per round.

The outer surface, internal gaps, corner radii, cell backgrounds, typography hierarchy, muted text, gold progress, and catastrophe gradient follow the Codex branch CSS values. The strip stays a single row on wide desktop viewports. Its desktop contents are entirely static.

Immediately below the primary desktop row, the status surface renders one compact full-width bunker band. The catastrophe description is not repeated in this band because it already sits directly below the catastrophe title in the primary scenario cell. The band contains the revealed bunker cards, bunker capacity, and the revealed threat as the final amber-accented card. This content is visible without a click, chevron, dropdown, or collapsed state.

## Shared Situation Content

`ScenarioSummary` owns the catastrophe presentation, including the warning icon, title, and description. An exported `ScenarioDetails` unit owns the compact bunker band: revealed bunker cards, capacity, and the revealed threat card. `GameStatusHeader` and the mobile `ScenarioSummary` both render `ScenarioDetails`, so both viewports receive the same game data and copy from one implementation.

The mobile summary receives the same red warning icon treatment as the desktop catastrophe cell and displays the catastrophe description immediately beside/below the title within the same summary surface. The icon is decorative and does not add a new interaction.

## Data Mapping

- Catastrophe title and description use `gameState.catastrophe`.
- Timer uses the existing `phaseEndTime`; phases without an end time show `—`.
- Timer label is “До голосования” during discussion and “До конца этапа” otherwise.
- Capacity uses `gameState.bunkerCapacity` and the number of alive players.
- Round uses `roundNumber` and `totalRounds`.
- Reveal progress intentionally mirrors the Codex reference and is based on round progress, not the count of all player cards.
- The redundant “Голосование N из N” status is not rendered or calculated by the game-screen view model and is not displayed on the dedicated voting screen. Server voting state and all voting mechanics remain unchanged.
- The host skip-discussion action remains available without changing its handler.

## Mobile Adaptation

At 768 pixels and below, the top strip displays only two equal compact cells: timer and round. The desktop catastrophe cell, capacity metric, reveal-progress metric, and desktop instance of the shared bunker band are hidden from the top strip. Their complete information remains available through the existing “Ситуация” tab: warning icon, catastrophe title and description in one summary, followed by the same compact bunker band used on desktop.

## Constraints

- Do not transfer the rest of the Codex game screen.
- Do not change server state, shared types, game phases, handlers, or timers.
- Keep desktop situation information permanently visible and non-interactive.
- Keep desktop and mobile bunker/threat data semantically identical by reusing `ScenarioDetails`.
- Do not render the catastrophe description a second time below the primary scenario summary.
- Keep the bunker band content-sized rather than stretching sparse text into tall cards.
- Keep the strip free of horizontal overflow at 320, 390, 1280, and 1920 pixels.
- Preserve 44-pixel minimum interactive targets.

## Verification

- Add component contracts for catastrophe icon/copy, alive-player capacity, contextual timer label, round-based zero-padded progress, and segmented round track.
- Add contracts proving that both desktop and mobile render `ScenarioDetails`, that the mobile summary includes the warning icon, and that desktop details have no dropdown semantics.
- Observe the new tests fail before implementation and pass afterward.
- Run the complete game-screen suite and client production build.
- Compare the desktop strip visually against the supplied reference at 1920 pixels.
- Verify the two-cell mobile strip at 320 and 390 pixels.
