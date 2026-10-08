import type { AvatarId } from "./avatars.js";

export const LEADERBOARD_SORTS = [
  "wins",
  "games",
  "coins",
  "collection",
  "collectionValue",
] as const;
export type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number];
export const LEADERBOARD_PAGE_SIZE = 20;

export interface LeaderboardQuery {
  sort: LeaderboardSort;
  page: number;
}

// Explicit public projection: no account credentials, sessions or inventory history.
export interface LeaderboardEntry {
  id: string;
  nickname: string;
  avatarId: AvatarId;
  rank: number;
  wins: number;
  games: number;
  coins: number;
  collection: number;
  collectionValue: number;
}

export interface LeaderboardSnapshot extends LeaderboardQuery {
  entries: LeaderboardEntry[];
  self: LeaderboardEntry | null;
  totalPlayers: number;
  totalPages: number;
  generatedAt: number;
}
