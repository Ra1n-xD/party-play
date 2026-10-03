import { createHash, randomInt, randomUUID } from "crypto";
import type { Socket } from "socket.io";
import {
  CASE_COST,
  CASE_ITEMS,
  GAME_REWARD,
  RARITIES,
  getCosmetic,
  nicknameKey,
  type ProfileSnapshot,
  type CaseOpening,
} from "../../../shared/platform/cosmetics.js";
import type { ClientEvents, ServerEvents } from "../../../shared/types.js";
import { getUpgradeQuote, type UpgradeAttempt } from "../../../shared/platform/upgrades.js";
import { DROP_FEED_LIMIT, type CosmeticDrop } from "../../../shared/platform/dropFeed.js";
import type { IOServer } from "./gameModule.js";
import {
  profileStore,
  profileStorageHealthy,
  profileTransaction as transaction,
} from "./profileStorage.js";
import { profileRoom, registerProfileAuthHandlers } from "./profileAuth.js";
import { getAllRooms, type Player, type Room } from "./roomManager.js";

import { registerLeaderboardHandlers } from "./leaderboard.js";
import { getServerGameModule } from "./gameRegistry.js";

type IOSocket = Socket<ClientEvents, ServerEvents>;
const DROP_FEED_ROOM = "__cosmetic_drops";
function makeDrop(
  profile: ProfileSnapshot,
  source: CosmeticDrop["source"],
  requestId: string,
  itemId: string,
  createdAt: number,
): CosmeticDrop {
  return {
    id: createHash("sha256")
      .update(JSON.stringify([nicknameKey(profile.nickname), source, requestId]))
      .digest("hex"),
    nickname: profile.nickname,
    itemId,
    source,
    createdAt,
  };
}
let recentDrops: CosmeticDrop[] = [];
if (profileStorageHealthy) {
  // Rebuild the public projection from receipts already saved with each profile.
  for (const profile of profileStore.profiles.values()) {
    const drops = [
      ...profile.recentOpenings.map((opening) =>
        makeDrop(profile, "case", opening.requestId, opening.itemId, opening.openedAt),
      ),
      ...(profile.recentUpgrades ?? [])
        .filter((attempt) => attempt.success)
        .map((attempt) =>
          makeDrop(profile, "upgrade", attempt.requestId, attempt.targetItemId, attempt.createdAt),
        ),
    ];
    recentDrops = [...recentDrops, ...drops]
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .slice(0, DROP_FEED_LIMIT);
  }
}
function publishDrop(drop: CosmeticDrop, io: IOServer): void {
  recentDrops = [drop, ...recentDrops.filter((entry) => entry.id !== drop.id)]
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    .slice(0, DROP_FEED_LIMIT);
  io.to(DROP_FEED_ROOM).emit("drops:snapshot", recentDrops);
}
export function getProfile(name: string): ProfileSnapshot | undefined {
  return [...profileStore.profiles.values()].find(
    (profile) => nicknameKey(profile.nickname) === nicknameKey(name),
  );
}
export function applyProfileToPlayer(
  player: Player,
  profileKey: string | null = player.profileKey,
): void {
  const profile = profileKey ? profileStore.profiles.get(profileKey) : undefined;
  if (profile && nicknameKey(profile.nickname) !== nicknameKey(player.owner.name)) {
    applyProfileToPlayer(player, null);
    return;
  }
  player.profileKey = profile?.id ?? null;
  player.avatarId = profile?.equipped.avatar ?? "human";
  player.cardSkins = profile
    ? { durak: profile.equipped.durak, uno: profile.equipped.uno }
    : { durak: "classic", uno: "classic" };
}
function publishProfile(key: string, io: IOServer): void {
  const profile = profileStore.profiles.get(key);
  if (profile) io.to(profileRoom(key)).emit("profile:snapshot", profile);
}
export function equipProfileItem(key: string, itemId: string, io: IOServer): ProfileSnapshot {
  const item = getCosmetic(itemId);
  const profile = profileStore.profiles.get(key);
  if (!item || !profile?.inventory[itemId])
    throw new Error("Этот предмет ещё не открыт. Найдите его в кейсе");
  for (const room of getAllRooms().values()) {
    if (
      room.lifecycle === "playing" &&
      [...room.players.values()].some(
        (player) => player.profileKey === key && !player.kicked && !player.voluntarilyLeft,
      )
    )
      throw new Error("Сменить скин можно после завершения партии");
  }
  transaction(() => {
    const current = profileStore.profiles.get(key)!;
    if (item.kind === "avatar") current.equipped.avatar = item.avatarId!;
    else current.equipped[item.kind] = item.cardSkinId!;
  });
  publishProfile(key, io);
  for (const room of getAllRooms().values())
    for (const player of room.players.values()) {
      if (player.profileKey === key && !player.kicked && !player.voluntarilyLeft)
        applyProfileToPlayer(player);
    }
  return profileStore.profiles.get(key)!;
}

export function registerProfileHandlers(
  socket: IOSocket,
  io: IOServer,
  membershipNickname: () => string | null,
  publishRooms: () => void,
): void {
  registerLeaderboardHandlers(socket);
  let requests: number[] = [];
  const guard = () => {
    const now = Date.now();
    requests = requests.filter((time) => now - time < 60_000);
    if (requests.length >= 40) throw new Error("Слишком много действий. Подождите минуту");
    requests.push(now);
  };
  socket.on("drops:subscribe", () => {
    const key = socket.data.profileKey as string | undefined;
    if (!key || !profileStore.profiles.has(key)) return;
    try {
      guard();
      socket.join(DROP_FEED_ROOM);
      socket.emit("drops:snapshot", recentDrops);
    } catch {
      // A subscription cannot mutate a profile or bypass its request limit.
    }
  });
  socket.on("drops:unsubscribe", () => {
    socket.leave(DROP_FEED_ROOM);
  });
  registerProfileAuthHandlers(socket, io, membershipNickname);
  socket.on("profile:equip", (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guard();
      if (!socket.data.profileKey || typeof data?.itemId !== "string")
        throw new Error("Сначала войдите в аккаунт");
      const profile = equipProfileItem(socket.data.profileKey, data.itemId, io);
      publishRooms();
      reply({ ok: true, value: profile });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
  socket.on("profile:open-case", (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guard();
      const key = socket.data.profileKey as string | undefined;
      const requestId = data?.requestId;
      if (!key || !profileStore.profiles.has(key)) throw new Error("Сначала войдите в аккаунт");
      if (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId))
        throw new Error("Некорректный запрос открытия");
      const existing = profileStore.profiles
        .get(key)!
        .recentOpenings.find((opening) => opening.requestId === requestId);
      if (existing)
        return reply({
          ok: true,
          value: { profile: profileStore.profiles.get(key)!, opening: existing },
        });
      if (profileStore.profiles.get(key)!.coins < CASE_COST)
        throw new Error("Недостаточно монет. Завершите партию, чтобы получить монету");
      const roll = randomInt(100);
      let cumulative = 0;
      const rarity = Object.entries(RARITIES).find(([, definition]) => {
        cumulative += definition.chance;
        return roll < cumulative;
      })![0];
      const pool = CASE_ITEMS.filter((item) => item.rarity === rarity);
      const item = pool[randomInt(pool.length)];
      const opening: CaseOpening = {
        requestId,
        itemId: item.id,
        duplicate: !!profileStore.profiles.get(key)!.inventory[item.id],
        openedAt: Date.now(),
      };
      transaction(() => {
        const profile = profileStore.profiles.get(key)!;
        profile.coins -= CASE_COST;
        profile.inventory[item.id] = (profile.inventory[item.id] ?? 0) + 1;
        profile.recentOpenings.unshift(opening);
        profile.recentOpenings = profile.recentOpenings.slice(0, 100);
      });
      publishProfile(key, io);
      publishDrop(
        makeDrop(profileStore.profiles.get(key)!, "case", requestId, item.id, opening.openedAt),
        io,
      );
      reply({ ok: true, value: { profile: profileStore.profiles.get(key)!, opening } });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
  socket.on("profile:upgrade", (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guard();
      const key = socket.data.profileKey as string | undefined;
      const profile = key ? profileStore.profiles.get(key) : undefined;
      if (!key || !profile) throw new Error("Сначала войдите в аккаунт");
      if (typeof data?.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(data.requestId))
        throw new Error("Некорректный запрос улучшения");
      const existing = profile.recentUpgrades?.find(
        (attempt) => attempt.requestId === data.requestId,
      );
      if (existing) return reply({ ok: true, value: { profile, attempt: existing } });
      const quote = getUpgradeQuote(data.inputs, data.targetItemId);
      if (!quote) throw new Error("Выберите от 1 до 5 предметов и более ценную цель");
      for (const input of data.inputs) {
        const item = getCosmetic(input.itemId)!;
        const protectedCopy = `${item.kind}:${profile.equipped[item.kind]}` === item.id ? 1 : 0;
        if ((profile.inventory[item.id] ?? 0) - protectedCopy < input.count)
          throw new Error(
            "Предметов недостаточно. Используемый экземпляр защищён: сначала смените его в коллекции",
          );
      }
      const roll = randomInt(10_000);
      const attempt: UpgradeAttempt = {
        requestId: data.requestId,
        inputs: data.inputs.map(({ itemId, count }) => ({ itemId, count })),
        targetItemId: data.targetItemId,
        ...quote,
        roll,
        success: roll < quote.chanceBasisPoints,
        createdAt: Date.now(),
      };
      transaction(() => {
        const current = profileStore.profiles.get(key)!;
        for (const input of attempt.inputs) {
          current.inventory[input.itemId] -= input.count;
          if (!current.inventory[input.itemId]) delete current.inventory[input.itemId];
        }
        if (attempt.success) {
          const count = (current.inventory[attempt.targetItemId] ?? 0) + 1;
          if (!Number.isSafeInteger(count)) throw new Error("Inventory limit exceeded");
          current.inventory[attempt.targetItemId] = count;
        }
        current.recentUpgrades = [attempt, ...(current.recentUpgrades ?? [])].slice(0, 100);
      });
      publishProfile(key, io);
      if (attempt.success)
        publishDrop(
          makeDrop(
            profileStore.profiles.get(key)!,
            "upgrade",
            attempt.requestId,
            attempt.targetItemId,
            attempt.createdAt,
          ),
          io,
        );
      reply({ ok: true, value: { profile: profileStore.profiles.get(key)!, attempt } });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
}

interface ProfileRound {
  id: string;
  players: Map<string, string>;
  paid: boolean;
  rewardKeys?: Set<string>;
  winnerKeys?: Set<string>;
  retry?: NodeJS.Timeout;
}
const rounds = new WeakMap<Room, ProfileRound>();
function payRound(round: ProfileRound, io: IOServer): void {
  if (round.paid || !round.rewardKeys) return;
  const keys = round.rewardKeys;
  try {
    if (!profileStore.rewardedMatches.has(round.id))
      transaction(() => {
        for (const key of keys) {
          const profile = profileStore.profiles.get(key);
          if (!profile) continue;
          profile.coins += GAME_REWARD;
          profile.completedGames += 1;
          if (round.winnerKeys?.has(key)) profile.wins += 1;
        }
        profileStore.rewardedMatches.add(round.id);
      });
    round.paid = true;
    clearTimeout(round.retry);
    for (const key of keys) publishProfile(key, io);
  } catch {
    if (round.retry) return;
    console.warn("Game reward could not be persisted; retrying shortly.");
    round.retry = setTimeout(() => {
      round.retry = undefined;
      payRound(round, io);
    }, 5000);
    round.retry.unref();
  }
}
export function syncRoomProfileRewards(room: Room, io: IOServer): void {
  if (room.lifecycle === "lobby") {
    rounds.delete(room);
    room.completedNaturally = false;
    return;
  }
  if (room.lifecycle === "playing" && !rounds.has(room)) {
    rounds.set(room, {
      id: randomUUID(),
      players: new Map(
        [...room.players.values()]
          .filter(
            (player) =>
              player.owner.kind === "human" &&
              player.profileKey &&
              !player.kicked &&
              !player.voluntarilyLeft,
          )
          .map((player) => [player.id, player.profileKey!]),
      ),
      paid: false,
    });
  }
  const round = rounds.get(room);
  if (room.lifecycle !== "results" || !round || round.paid) return;
  const result = getServerGameModule(room.gameId)?.completedMatchResult(room);
  if (!result) {
    round.paid = true;
    return;
  }
  if (!round.rewardKeys) {
    const participants = new Set(result.participantSeatIds);
    const winners = new Set(result.winnerSeatIds);
    round.rewardKeys = new Set();
    round.winnerKeys = new Set();
    for (const [id, key] of round.players) {
      const player = room.players.get(id);
      if (
        !player ||
        player.profileKey !== key ||
        player.kicked ||
        player.voluntarilyLeft ||
        !participants.has(id)
      )
        continue;
      round.rewardKeys.add(key);
      if (winners.has(id)) round.winnerKeys.add(key);
    }
  }
  payRound(round, io);
}
