# Repository Guidelines

## Project Structure & Module Organization

PartySide is a real-time multiplayer platform using npm workspaces:

- `client/src/`: React UI; `platform/` contains shared flows, `games/<gameId>/` contains game interfaces. Assets live in `client/src/assets/`, game-local `assets/`, and `client/public/`.
- `server/src/`: Express and Socket.IO; `platform/` owns rooms, sessions, and reconnects; `games/<gameId>/` owns rules, bots, and projections.
- `shared/platform/` and `shared/games/`: contracts and game types shared by both applications.
- `docs/ARCHITECTURE.md`: canonical architecture and game-registration instructions; `docs/DEPLOY.md`: deployment setup.

Prefer canonical `platform/` and `games/` modules over legacy compatibility entry points. Keep game rules isolated and validate multiplayer state changes on the server. Update all consumers when shared contracts change.

## Initial HTML and SEO

Production HTML and the browser must render the same initial `AppRoot` tree. The build prerenders the actual application screens with `renderToString`; the browser attaches them with `hydrateRoot`. Never introduce a separate static copy of the menu, updates, or another app screen. Changes to shared components must automatically reach both renders.

- Keep initial rendering deterministic and independent of browser storage, viewport, socket state, current time, or random values. Read client state in effects; use CSS for responsive first paint. Do not hide hydration errors with `suppressHydrationWarning`.
- Preserve visible public descriptions, canonical game rules, crawlable `<a href>` links, metadata, canonical URLs, JSON-LD, robots and sitemap. Update `siteMetadata.ts` and the canonical game registry/rules when routes or game capabilities change. Private account/room data must never enter prerendered HTML.
- Maintain the early startup handling for saved rooms and `/?game=<id>` so the catalog does not flash before the destination. Handle unavailable storage, invalid sessions and cancellation without trapping the player behind a loader.
- For changes to routes, menus, headers, initial state or public copy, check the production build, its source HTML and cold browser loads on desktop/mobile. Check browser hydration errors, direct links, saved-account/room recovery and SPA navigation. See `docs/ARCHITECTURE.md`, “Публичные страницы и SEO”.

## Build, Test, and Development Commands

Run from the repository root:

- `npm ci`: install dependencies from the lockfile.
- `npm run dev`: start the server and Vite client together; client defaults to port 5173, server to 3001.
- `npm run dev:server` / `npm run dev:client`: run either workspace separately.
- `npm run build`: compile the server, type-check the client, and bundle into workspace `dist/` directories.
- `npm run format:check`: check Prettier formatting.
- `npx prettier --write <path>`: format changed files; avoid repository-wide formatting sweeps.
- `git diff --check`: detect whitespace errors.

## Coding Style & Naming Conventions

Use strict TypeScript and ES modules. Prettier specifies two spaces, double quotes, semicolons, trailing commas, and 100-column lines. Use PascalCase components/types, camelCase functions/variables, and `useSomething` hooks. Preserve `.js` extensions in server-relative imports. Keep user-facing text consistent with the existing Russian UI. No ESLint configuration is present.

## Testing Guidelines

There is no automated test suite, test script, naming convention, or coverage threshold. Creating, modifying, or running automated tests requires a separate user request. For code changes, build and check formatting; manually verify affected room flows with multiple clients, including reconnects, spectators, bots, and replay. Include mobile checks for UI changes. Report checks actually performed.

## Commit & Pull Request Guidelines

Every completed development change must include an application version bump, once per logical set of changes. Use semantic versioning: `patch` for fixes, small UI refinements, and maintenance; `minor` for new backward-compatible features; `major` for breaking changes or a substantial new product generation. Choose the highest applicable level and reset lower components when raising `minor` or `major`. Follow an exact version requested by the user. The root `package.json` is the source of the application version; keep the top-level `version` and `packages[""].version` in `package-lock.json` synchronized with it.

History predominantly uses Conventional Commits, e.g. `fix(durak): preserve throw-in turns`. PRs should explain behavior changes, link relevant issues, list validation, and include screenshots for UI changes.

Agents must preserve existing changes, leave edits unstaged, never stage/commit/push/merge/rebase, and suggest an English commit message. Branch or destructive Git operations require explicit requests.

## Player-Facing Release Notes

The site's **«Обновления»** page (`/updates`) is a curated product history, not a complete changelog. Add important player-visible changes before the task is complete, without waiting for a separate request: new games or capabilities, substantial visual improvements, and meaningful economy or progression changes. Judge importance by the player's benefit, not the number of changed files or the version bump. A version bump alone does not require an entry. Do not publish bug fixes on this page, including fixes that restore broken gameplay; describe them in commits and development reports instead.

- Update the canonical list in `client/src/platform/releaseHighlights.ts` when a change meets this importance threshold. Add new entries first, with a unique ID, the actual feature version and date, a short Russian title, summary, and concrete changes for players.
- Do not add entries or bullet points for bug fixes, small case-logic adjustments, minor probability/value display changes, sorting, spacing, copy edits, routine validation, refactoring, or internal reliability details. Mention other refinements only if they materially change what players can do.
- Keep one entry per coherent product update, usually with 2–5 concise changes. Group related follow-up patches into the existing entry with an accurate version range instead of adding a card for every patch. Amend it while the same update is in progress. Preserve meaningful historical milestones; remove or consolidate redundant minor entries. Do not invent dates or include unimplemented plans.
- For visual changes, reuse or capture a real screenshot when it helps explain the update. Store it in `client/src/assets/updates/`, provide accurate dimensions, caption and alt text, and label demo data or reconstructed historical views. Do not substitute unrelated or generated images for product screenshots.
- Check `/updates` on desktop and mobile, including the new entry, version navigation, and image enlargement when images were added. In the final response, state that release notes were updated, or briefly explain why the change did not warrant a highlight. Adding an entry does not authorize deployment.

## Security & Configuration

Keep `.env*`, credentials, and `server/.data/` untracked. Never expose private game state or session tokens in public payloads. Pushes to `main` trigger deployment; deploy only when explicitly requested.
