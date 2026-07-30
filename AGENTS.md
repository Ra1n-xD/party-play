# AGENTS.md

This file defines repository-specific rules for Codex and other coding agents.

## Project Overview

PartyPlay is a real-time multiplayer platform for a collection of independent
party games.

The platform provides shared infrastructure such as rooms, sessions,
real-time communication, and common UI. Each game is a separate module and
must not define the architecture of the whole platform.

## Repository Structure

The project is an npm-workspaces monorepo:

- `shared/` — common types, contracts, and utilities.
- `server/` — backend, real-time communication, platform services, and
  server-side game logic.
- `client/` — frontend, shared UI, platform flows, and client-side game
  interfaces.
- `docs/` — architecture and project documentation.

Keep platform-wide code separate from game-specific code. Place functionality
in the narrowest appropriate scope and move it into shared infrastructure only
when it is genuinely reusable.

## Non-Negotiable Git Rules

- **Never stage, commit, or push changes.** Never run `git add`, `git commit`,
  or `git push`, and do not use equivalent commands or tools. The user performs
  all staging, committing, and pushing personally.
- Leave every agent change unstaged and never alter changes that the user has
  already staged.
- Check the worktree before editing and preserve all pre-existing or unrelated
  changes.
- Do not create, rename, switch, or delete branches unless the user explicitly
  requests that exact operation. Such a request never authorizes staging,
  committing, or pushing.
- Never run `merge` or `rebase`.
- Do not run `reset`, `restore`, `stash`, or `clean` unless the user explicitly
  requests that exact operation. Never use them as cleanup or as a workaround
  for these rules.
- Read-only Git commands such as `git status`, `git diff`, `git log`, and
  `git branch` are allowed.
- After every completed task, provide one suggested commit message in English.
  Never execute that commit.

## Branch and Commit Conventions

Use short, descriptive, kebab-case branch names:

```text
feature/<topic>
fix/<topic>
```

Use `docs/`, `chore/`, or `refactor/` when they describe the branch better.
Avoid personal names, tool names, vague abbreviations, and spelling errors.

Suggested commit messages must follow Conventional Commits:

```text
<type>(<optional-scope>): <imperative English summary>
```

Allowed types:

- `feat`
- `fix`
- `docs`
- `style`
- `refactor`
- `test`
- `ci`
- `chore`

Use a scope such as `client`, `server`, `shared`, `platform`, or a game name
only when it adds useful precision.

Examples:

```text
feat(client): add room invitation flow
fix(server): preserve player session
docs: simplify repository guidelines
```

End the final response for every completed task with one task-specific line:

```text
Commit message: <type>(<optional-scope>): <imperative English summary>
```

## Common Commands

```bash
# Install dependencies
npm install

# Run the complete development environment
npm run dev

# Run one side only
npm run dev:server
npm run dev:client

# Build the project
npm run build

# Check formatting without modifying files
npm run format:check
```

Do not create, modify, or run automated tests without a separate user request.

Avoid repository-wide formatting when only a small set of files changed.

## Working Principles

- Keep every change focused on the requested task.
- Do not perform unrelated refactors, dependency upgrades, formatting sweeps,
  or generated-file updates.
- Follow existing patterns before introducing new abstractions.
- Keep multiplayer state and validation server-authoritative unless the task
  explicitly changes that architecture.
- Every active game must publish complete, original rules through the client
  game registry and expose the shared accessible rules dialog both in the home
  catalog and in the active-game header. Rule text must match the implemented
  server rules; placeholder cards do not receive rule content.
- Shared room reactions are ephemeral platform events, not game commands or
  room snapshots. Only a connected human-controlled player seat may send them;
  spectators and bots may receive them but never send them. Keep validation,
  identity, and rate limiting server-authoritative, never advance room revision
  or expose hidden game state, and preserve accessible responsive controls.
- Every game must expose the shared host room-management flow in its lobby and
  active game UI. The host must be able to resolve seat claims and permanently
  kick any other human player through platform commands; authorization and
  connection removal stay server-authoritative, while each game normalizes its
  runtime through `excludeSeat`. Kicking an already out or eliminated player
  closes room access without rewriting game history; completed results stay
  immutable.
- When a shared contract changes, update all affected producers and consumers.
- Keep game-specific rules, state, content, and UI isolated from other games
  and from shared platform infrastructure.
- Follow the language and style of the existing user-facing surface.
- Never expose secrets or log credential values.
- Do not modify generated, runtime, or internal tooling artifacts unless the
  task explicitly targets them.
- Do not initiate deployment unless the user explicitly requests it.
- Validate changes proportionally with relevant builds and formatting checks.
