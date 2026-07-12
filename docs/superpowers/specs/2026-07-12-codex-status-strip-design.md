# Codex Status Strip Design

## Goal

Replace the current approximate game information strip with the desktop structure and visual proportions from `feature/new-design-codex`, matching the supplied Codex reference as closely as the existing game data permits. Preserve the previously approved compact mobile behavior and all game logic.

## Desktop Structure

The status strip uses the Codex layout directly instead of composing the generic `ScenarioSummary` component:

1. A wide catastrophe cell containing the red warning icon, uppercase eyebrow, catastrophe title, description, and the existing expand interaction.
2. A timer metric with clock icon, contextual label, large gold value, and the current phase description.
3. A bunker-capacity metric with shield icon, `capacity/alive players` value, and supporting copy.
4. A round metric with round icon, `current/total` value, and phase label.
5. A wide reveal-progress metric with title and zero-padded `current round / total rounds` value on one line, followed by one segment per round.

The outer surface, internal gaps, corner radii, cell backgrounds, typography hierarchy, muted text, gold progress, and catastrophe gradient follow the Codex branch CSS values. The strip stays a single row on wide desktop viewports. Scenario details expand below the entire strip using the existing state and callback.

## Data Mapping

- Catastrophe title and description use `gameState.catastrophe`.
- Timer uses the existing `phaseEndTime`; phases without an end time show `—`.
- Timer label is “До голосования” during discussion and “До конца этапа” otherwise.
- Capacity uses `gameState.bunkerCapacity` and the number of alive players.
- Round uses `roundNumber` and `totalRounds`.
- Reveal progress intentionally mirrors the Codex reference and is based on round progress, not the count of all player cards.
- Existing voting information and host skip-discussion action remain available without changing handlers.

## Mobile Adaptation

At 768 pixels and below, the top strip displays only two equal compact cells: timer and round. The catastrophe cell, capacity metric, reveal-progress metric, and expanded desktop details are hidden from the top strip. Their information remains available through the existing “Ситуация” tab, which continues to render `ScenarioSummary` with bunker and threat details.

## Constraints

- Do not transfer the rest of the Codex game screen.
- Do not change server state, shared types, game phases, handlers, or timers.
- Keep the strip free of horizontal overflow at 320, 390, 1280, and 1920 pixels.
- Preserve 44-pixel minimum interactive targets.

## Verification

- Add component contracts for catastrophe icon/copy, alive-player capacity, contextual timer label, round-based zero-padded progress, and segmented round track.
- Observe the new tests fail before implementation and pass afterward.
- Run the complete game-screen suite and client production build.
- Compare the desktop strip visually against the supplied reference at 1920 pixels.
- Verify the two-cell mobile strip at 320 and 390 pixels.
