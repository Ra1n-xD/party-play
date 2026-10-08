import { getUpgradeInputValue } from "../../../shared/platform/upgrades.js";
import type { Socket } from "socket.io";
import type { ClientEvents, ServerEvents } from "../../../shared/types.js";
import { BASIC_ITEMS } from "../../../shared/platform/cosmetics.js";
import {
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_SORTS,
  type LeaderboardEntry,
  type LeaderboardSort,
} from "../../../shared/platform/leaderboard.js";
import { assertProfileStorage, profileStore, profileStoreRevision } from "./profileStorage.js";

let cachedRevision = -1;
const rankings = new Map<LeaderboardSort, LeaderboardEntry[]>();

function ranking(sort: LeaderboardSort): LeaderboardEntry[] {
  assertProfileStorage();
  if (cachedRevision !== profileStoreRevision) {
    rankings.clear();
    cachedRevision = profileStoreRevision;
  }
  const cached = rankings.get(sort);
  if (cached) return cached;
  const entries: LeaderboardEntry[] = [...profileStore.profiles.values()].map((profile) => ({
    id: profile.id,
    nickname: profile.nickname,
    avatarId: profile.equipped.avatar,
    rank: 0,
    wins: profile.wins,
    games: profile.completedGames,
    coins: profile.coins,
    collectionValue: getUpgradeInputValue(
      Object.entries(profile.inventory)
        .filter(([id]) => !BASIC_ITEMS.includes(id))
        .map(([itemId, count]) => ({ itemId, count })),
    ),
    collection: Object.keys(profile.inventory).filter((id) => !BASIC_ITEMS.includes(id)).length,
  }));
  entries.sort(
    (a, b) =>
      b[sort] - a[sort] || a.nickname.localeCompare(b.nickname, "ru") || a.id.localeCompare(b.id),
  );
  entries.forEach((entry, index) => {
    entry.rank =
      index > 0 && entries[index - 1][sort] === entry[sort] ? entries[index - 1].rank : index + 1;
  });
  rankings.set(sort, entries);
  return entries;
}

export function registerLeaderboardHandlers(socket: Socket<ClientEvents, ServerEvents>): void {
  let requests: number[] = [];
  socket.on("leaderboard:get", (query, reply) => {
    if (typeof reply !== "function") return;
    try {
      const now = Date.now();
      requests = requests.filter((time) => now - time < 60_000);
      if (requests.length >= 40) throw new Error("Слишком много запросов. Подождите минуту");
      requests.push(now);
      if (
        !query ||
        !LEADERBOARD_SORTS.includes(query.sort) ||
        !Number.isSafeInteger(query.page) ||
        query.page < 1
      ) {
        throw new Error("Некорректные параметры рейтинга");
      }
      const entries = ranking(query.sort);
      const totalPages = Math.max(1, Math.ceil(entries.length / LEADERBOARD_PAGE_SIZE));
      const page = Math.min(query.page, totalPages);
      reply({
        ok: true,
        value: {
          sort: query.sort,
          page,
          entries: entries.slice((page - 1) * LEADERBOARD_PAGE_SIZE, page * LEADERBOARD_PAGE_SIZE),
          self: entries.find((entry) => entry.id === socket.data.profileKey) ?? null,
          totalPlayers: entries.length,
          totalPages,
          generatedAt: now,
        },
      });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
}
