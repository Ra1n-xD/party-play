# Repository Guidelines

## Project Structure & Module Organization

PartyPlay is a real-time multiplayer platform using npm workspaces:

- `client/src/`: React UI; `platform/` contains shared flows, `games/<gameId>/` contains game interfaces. Assets live in `client/src/assets/`, game-local `assets/`, and `client/public/`.
- `server/src/`: Express and Socket.IO; `platform/` owns rooms, sessions, and reconnects; `games/<gameId>/` owns rules, bots, and projections.
- `shared/platform/` and `shared/games/`: contracts and game types shared by both applications.
- `docs/ARCHITECTURE.md`: canonical architecture and game-registration instructions; `docs/DEPLOY.md`: deployment setup.

Prefer canonical `platform/` and `games/` modules over legacy compatibility entry points. Keep game rules isolated and validate multiplayer state changes on the server. Update all consumers when shared contracts change.

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

Important player-visible changes must appear on the site's **«Обновления»** page (`/updates`) before the task is complete, without waiting for a separate request. This includes new features, games, economy or progression changes, substantial visual improvements, and significant gameplay fixes. Minor and major releases always require an entry; small internal maintenance changes do not need their own highlight.

- Update the canonical list in `client/src/platform/releaseHighlights.ts` alongside the implementation and version bump. Add new entries first, with a unique ID, the actual feature version and date, a short Russian title, summary, and concrete changes for players.
- Keep one entry per logical release. Amend it while the same release is in progress; group related patch versions only with an accurate version range. Preserve earlier history and do not invent dates or include unimplemented plans.
- For visual changes, reuse or capture a real screenshot when it helps explain the update. Store it in `client/src/assets/updates/`, provide accurate dimensions, caption and alt text, and label demo data or reconstructed historical views. Do not substitute unrelated or generated images for product screenshots.
- Check `/updates` on desktop and mobile, including the new entry, version navigation, and image enlargement when images were added. In the final response, state that release notes were updated, or briefly explain why the change did not warrant a highlight. Adding an entry does not authorize deployment.

## Security & Configuration

Keep `.env*`, credentials, and `server/.data/` untracked. Never expose private game state or session tokens in public payloads. Pushes to `main` trigger deployment; deploy only when explicitly requested.
