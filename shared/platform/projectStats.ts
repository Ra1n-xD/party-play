import type { GameId } from "./gameContract.js";

export interface ProjectStatsTotals {
  uniquePlayerDevices: number;
  playerEntries: number;
  spectatorEntries: number;
  roomsCreated: number;
  publicRoomsCreated: number;
  gamesStarted: number;
  gamesCompleted: number;
}

export interface ProjectStatsLive {
  rooms: number;
  publicRooms: number;
  connectedPlayers: number;
  connectedSpectators: number;
}

export interface ProjectGameStats {
  totals: ProjectStatsTotals;
  live: ProjectStatsLive;
}

export type ProjectStatsByGame = {
  [G in GameId]: ProjectGameStats;
};

export interface ProjectStatsSnapshot {
  trackingStartedAt: number;
  generatedAt: number;
  totals: ProjectStatsTotals;
  live: ProjectStatsLive;
  byGame: ProjectStatsByGame;
}
