# Global Interface Theme Design

## Goal

Bring every remaining PartyPlay screen and global overlay into the same dark green, graphite, amber, and muted semantic palette as the redesigned Bunker game screen. Preserve all existing layouts, component behavior, handlers, game state, and user flows.

## Scope

The theme update covers:

- Home screen and footer.
- Lobby, room code, player readiness, bot controls, and spectator state.
- Voting screen, candidates, vote progress, confirmations, waiting states, and its host controls.
- Results screen, survivor and eliminated groups, bunker summary, threat, and vote bars.
- Shared inputs, buttons, timers, modals, toasts, pause overlay, phase announcements, reveal overlays, particles, and app version label.

The redesigned `GameScreen` remains structurally unchanged. Its local `--gs-*` palette stays authoritative, while global siblings such as pause and reveal overlays are brought into the same theme.

## Palette

- Page background: `#07100c`.
- Primary surface: `#101713`.
- Strong/hover surface: `#141b17`.
- Primary text: `#f3f1e8`.
- Secondary text: `#b7c0ba`.
- Muted text: `#7f8b83`.
- Primary amber accent: `#efbd58`.
- Amber hover: `#f6d181`.
- Success and ready state: `#76c69e`.
- Danger and elimination state: `#d9786c`.
- Borders use low-opacity green-grey values based on `rgb(178 199 185)`.

Semantic characteristic colors remain distinct: profession `#fbbf24`, biology `#fb923c`, health `#f87171`, hobby `#34d399`, baggage `#60a5fa`, fact `#22d3ee`, and action card `#c084fc`. Telegram `#26a5e4`, Twitch `#9146ff`, and donation `#f57b22` brand colors also remain unchanged.

## Implementation approach

Use a token-first update in `global.css`:

1. Replace the legacy purple root tokens with the approved palette.
2. Replace hard-coded purple shell gradients, glows, borders, and translucent surfaces with the matching amber, green, graphite, or danger treatment.
3. Leave semantic characteristic and external brand selectors untouched.
4. Keep `game-screen.css` local overrides intact and verify that global changes do not regress the redesigned game screen.

Do not add a trailing override theme layer and do not split the stylesheet by screen. Both would introduce unnecessary duplication or refactoring for a color-only change.

## Screen treatments

### Home

- Use the page background and subtle amber/green radial lighting.
- Replace the purple-blue logo gradient and primary buttons with amber treatments and dark contrast text.
- Use graphite glass surfaces and green-grey borders for inputs and the footer.

### Lobby

- Use amber for the room title, room code, host state, current-player state, and primary actions.
- Use green for ready states and keep danger red for bot removal and leaving actions.
- Keep cyan bot identity accents because they are semantic.

### Voting

- Use the graphite header and surfaces from the redesigned game screen.
- Use amber for neutral progress, selection, timers, and host controls.
- Keep vote-to-eliminate actions red and accepted votes green.

### Results

- Use amber for the primary result heading and current-player emphasis.
- Keep survivors green and eliminated players red/dimmed.
- Use graphite cards and green-grey borders for bunker, threat, player, and vote result sections.

### Global overlays

- Pause and phase announcements use dark translucent backdrops with amber titles.
- Reveal overlays retain the semantic color of the revealed characteristic while their shell becomes graphite.
- Generic modals use graphite surfaces and amber focus/selection states.
- Action toasts become green/amber rather than purple; error toasts remain muted red.
- Background particles become subtle green, matching the game screen.

## Responsive behavior

No layout breakpoint or spacing behavior changes. Color contrast and focus visibility must remain clear at desktop and mobile widths. Existing reduced-motion behavior remains unchanged.

## Verification

- Add CSS regression checks for the root palette and representative selectors from Home, Lobby, Vote, Results, modals, overlays, and particles.
- Add a legacy-purple scan with an explicit allowlist for semantic characteristic and brand colors.
- Run the existing game-screen tests to catch regressions from shared global selectors.
- Run the client production build, Prettier, and `git diff --check`.
- Visually inspect Home, Lobby, Vote, Results, and representative overlays at desktop and mobile widths.
