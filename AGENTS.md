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

History predominantly uses Conventional Commits, e.g. `fix(durak): preserve throw-in turns`. PRs should explain behavior changes, link relevant issues, list validation, and include screenshots for UI changes.

Agents must preserve existing changes, leave edits unstaged, never stage/commit/push/merge/rebase, and suggest an English commit message. Branch or destructive Git operations require explicit requests.

## Security & Configuration

Keep `.env*`, credentials, and `server/.data/` untracked. Never expose private game state or session tokens in public payloads. Pushes to `main` trigger deployment; deploy only when explicitly requested.
