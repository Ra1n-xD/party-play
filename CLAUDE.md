# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Бункер" (Bunker) is a real-time multiplayer social deduction game built as a web app. Players argue over who deserves a spot in a fallout bunker during a catastrophe, eliminating each other through voting rounds. Digital adaptation of the Russian tabletop game by Economicus.

## Commands

```bash
# Install all dependencies (root + workspaces)
npm install

# Run both server and client in dev mode (concurrent)
npm run dev

# Run server only (tsx watch, hot-reload, port 3001)
npm run dev:server

# Run client only (Vite dev server, port 5173)
npm run dev:client

# Build client
npm -w client run build

# Build server
npm -w server run build
```

No test framework is configured.

## Architecture

**Monorepo** using npm workspaces with three packages: `shared`, `server`, `client`.

### shared/
Single file `types.ts` — all TypeScript interfaces and Socket.IO event type maps used by both server and client. Contains `GamePhase` (9 phases), `PublicGameState`, `Character`, `ClientEvents`/`ServerEvents`.

### server/ (Express + Socket.IO)
- **`src/index.ts`** — Express app + Socket.IO server on port 3001, calls `registerHandlers(io)`
- **`src/config.ts`** — All tunable constants (timers, player limits, round counts)
- **`src/socketHandlers.ts`** — Socket event registration; maintains `socketRoomMap` for O(1) socket→room/player lookup. Routes events to roomManager and gameEngine
- **`src/roomManager.ts`** — In-memory `Map<string, Room>` holding all rooms/players/game state. No database
- **`src/gameEngine.ts`** — Core game logic: phase transitions via `setTimeout` chains, voting/tiebreak, attribute reveals, action card effects, bot action scheduling. `broadcastState()` pushes full `PublicGameState` to all clients after every change
- **`src/characterGenerator.ts`** — Random character generation (6 attributes + 1 action card)
- **`src/botManager.ts`** — AI bot scheduling (random reveals, staggered votes, 30% chance to use action cards)
- **`src/data/`** — Static game content arrays (professions, health, hobbies, baggage, facts, catastrophes, bunkers, actions) all in Russian

### client/ (React 18 + Vite + TypeScript)
- **`src/socket.ts`** — Typed Socket.IO client singleton, `autoConnect: false`. In dev connects to `http://<hostname>:3001` (LAN-friendly)
- **`src/context/GameContext.tsx`** — Single React context provider managing all state. Listens to server events, stores `gameState`, `myCharacter` (private), handles reconnection via `sessionStorage`
- **`src/App.tsx`** — Phase-based screen router (switch on `gameState.phase`)
- **`src/screens/`** — One screen per game phase group: HomeScreen, LobbyScreen, GameScreen (covers reveal/discussion/result phases), VoteScreen, ResultsScreen

### Key Patterns

- **State flow is server-authoritative**: every mutation triggers `broadcastState()` which serializes and pushes the full public game state to all clients. Clients never maintain local game logic.
- **Private data** (full character) is sent only via `game:character` to the owning socket, never in the public broadcast.
- **Phase timers** are server-side `setTimeout`s. `phaseEndTime` (epoch ms) is included in public state so clients render countdowns via `endTime - Date.now()`.
- **Reconnection**: client auto-emits `room:rejoin` on socket reconnect using `sessionStorage` credentials. Server restores socket mapping and resends character + state.
- **All game content is in Russian** — UI text, data arrays, action card descriptions.

### Game Flow

```
LOBBY → CATASTROPHE_REVEAL (8s) → [Rounds 1-5]:
  BUNKER_EXPLORE (5s, reveals next bunker card)
  → ROUND_REVEAL (turn-based attribute reveals; Round 1 auto-reveals professions)
  → ROUND_DISCUSSION (60s) → ROUND_VOTE (60s, or early when all voted)
    → tie? ROUND_VOTE_TIEBREAK (30s defense + 60s vote, second tie = random elimination)
  → ROUND_RESULT (6s)
  → (repeat discussion/vote if multiple eliminations scheduled this round)
→ GAME_OVER (when round 5 ends or alive ≤ bunkerCapacity)
```

Voting schedule distributes `playerCount - floor(playerCount/2)` eliminations across 5 rounds. Last-eliminated player votes alongside alive players each round.
