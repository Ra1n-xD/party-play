# PartyPlay

Real-time multiplayer party games platform. Play with friends from any device — just share the room code.

## Current Games

### Bunker (Бункер)

Social deduction game for 4-16 players. A catastrophe strikes, and there's a bunker with limited capacity. Each player gets a random character with unique traits — profession, health, hobby, baggage, phobia, and a special action card. Over 5 rounds, players reveal their attributes, argue their case, and vote to eliminate those who don't deserve a spot. Survive the vote and make it into the bunker to win.

## Roadmap

The platform is designed as a plugin-based system — each game is an isolated package with its own engine, types, screens, and data. The shared core provides rooms, lobbies, sockets, and UI components. New games can be added without modifying the core. See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## Tech Stack

- **Server:** Node.js, Express, Socket.IO
- **Client:** React 18, Vite, TypeScript
- **Structure:** npm workspaces monorepo (`shared`, `server`, `client`)

## Getting Started

```bash
# Install dependencies
npm install

# Run in dev mode (server + client)
npm run dev
```

Server runs on `http://localhost:3001`, client on `http://localhost:5173`.

## Build

```bash
npm run build
```

## Deploy

See [DEPLOY.md](DEPLOY.md) for VPS deployment guide with auto-deploy via GitHub Actions.
