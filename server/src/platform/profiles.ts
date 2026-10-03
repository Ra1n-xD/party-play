import { createHash, randomInt, randomUUID } from "crypto";
import type { Socket } from "socket.io";
import {
  CASE_COST,
  CASE_ITEMS,
  GAME_REWARD,
  RARITIES,
  getCosmetic,
  isCosmeticInUse,
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
import { assertProfileSession, profileRoom, registerProfileAuthHandlers } from "./profileAuth.js";
import { guardProfileRequest } from "./profileRateLimit.js";
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
export function syncLobbyProfileCosmetics(room: Room): void {
  if (room.lifecycle !== "lobby") return;
  // A saved equip can finish after the game starts. Apply it before the next lobby snapshot,
  // including human-owned seats whose controller was temporarily replaced by a bot.
  for (const player of room.players.values()) {
    if (
      player.owner.kind === "human" &&
      player.profileKey &&
      !player.kicked &&
      !player.voluntarilyLeft
    )
      applyProfileToPlayer(player);
  }
}
function publishProfile(key: string, io: IOServer): void {
  const profile = profileStore.profiles.get(key);
  if (profile) io.to(profileRoom(key)).emit("profile:snapshot", profile);
}
export async function equipProfileItem(
  key: string,
  itemId: string,
  io: IOServer,
  assertAllowed: () => void,
): Promise<ProfileSnapshot> {
  const item = getCosmetic(itemId);
  let changed = false;
  await transaction([key], (draft) => {
    assertAllowed();
    const current = draft.profiles.get(key);
    if (!item || !current?.inventory[itemId])
      throw new Error("Этот предмет ещё не открыт. Найдите его в кейсе");
    if (isCosmeticInUse(current, item)) return false;
    if (item.kind === "reaction") return false;
    for (const room of getAllRooms().values()) {
      if (
        room.lifecycle === "playing" &&
        [...room.players.values()].some(
          (player) => player.profileKey === key && !player.kicked && !player.voluntarilyLeft,
        )
      )
        throw new Error("Сменить скин можно после завершения партии");
    }
    if (item.kind === "avatar") current.equipped.avatar = item.avatarId!;
    else current.equipped[item.kind] = item.cardSkinId!;
    changed = true;
  });
  if (!changed) return profileStore.profiles.get(key)!;
  publishProfile(key, io);
  for (const room of getAllRooms().values()) {
    // A game may have started while the disk write was in flight. Keep its chosen cosmetics.
    if (room.lifecycle === "playing") continue;
    let affected = false;
    for (const player of room.players.values()) {
      if (player.profileKey === key && !player.kicked && !player.voluntarilyLeft) {
        applyProfileToPlayer(player);
        affected = true;
      }
    }
    if (affected) getServerGameModule(room.gameId)?.publish(room, io);
  }
  return profileStore.profiles.get(key)!;
}

export function registerProfileHandlers(
  socket: IOSocket,
  io: IOServer,
  membershipNickname: () => string | null,
): void {
  registerLeaderboardHandlers(socket);
  const guard = () => guardProfileRequest(socket);
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
  socket.on("profile:equip", async (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guard();
      if (!socket.data.profileKey || typeof data?.itemId !== "string")
        throw new Error("Сначала войдите в аккаунт");
      const key = socket.data.profileKey as string;
      const profile = await equipProfileItem(key, data.itemId, io, () =>
        assertProfileSession(socket, key),
      );
      reply({ ok: true, value: profile });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
  socket.on("profile:open-case", async (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guard();
      const key = socket.data.profileKey as string | undefined;
      const requestId = data?.requestId;
      if (!key || !profileStore.profiles.has(key)) throw new Error("Сначала войдите в аккаунт");
      if (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId))
        throw new Error("Некорректный запрос открытия");
      let opening!: CaseOpening;
      let created = false;
      await transaction([key], (draft) => {
        assertProfileSession(socket, key);
        const profile = draft.profiles.get(key)!;
        const existing = profile.recentOpenings.find((entry) => entry.requestId === requestId);
        if (existing) {
          opening = existing;
          return false;
        }
        if (profile.coins < CASE_COST)
          throw new Error("Недостаточно монет. Завершите партию, чтобы получить монету");
        const roll = randomInt(100);
        let cumulative = 0;
        const rarity = Object.entries(RARITIES).find(([, definition]) => {
          cumulative += definition.chance;
          return roll < cumulative;
        })![0];
        const pool = CASE_ITEMS.filter((item) => item.rarity === rarity);
        const item = pool[randomInt(pool.length)];
        opening = {
          requestId,
          itemId: item.id,
          duplicate: !!profile.inventory[item.id],
          openedAt: Date.now(),
        };
        profile.coins -= CASE_COST;
        profile.inventory[item.id] = (profile.inventory[item.id] ?? 0) + 1;
        profile.recentOpenings.unshift(opening);
        profile.recentOpenings = profile.recentOpenings.slice(0, 100);
        created = true;
      });
      if (created) {
        publishProfile(key, io);
        publishDrop(
          makeDrop(
            profileStore.profiles.get(key)!,
            "case",
            requestId,
            opening.itemId,
            opening.openedAt,
          ),
          io,
        );
      }
      reply({ ok: true, value: { profile: profileStore.profiles.get(key)!, opening } });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
  socket.on("profile:upgrade", async (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guard();
      const key = socket.data.profileKey as string | undefined;
      const profile = key ? profileStore.profiles.get(key) : undefined;
      if (!key || !profile) throw new Error("Сначала войдите в аккаунт");
      if (typeof data?.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(data.requestId))
        throw new Error("Некорректный запрос улучшения");
      const quote = getUpgradeQuote(data.inputs, data.targetItemId);
      if (!quote) throw new Error("Выберите от 1 до 5 предметов и более ценную цель");
      let attempt!: UpgradeAttempt;
      let created = false;
      await transaction([key], (draft) => {
        assertProfileSession(socket, key);
        const current = draft.profiles.get(key)!;
        const existing = current.recentUpgrades?.find(
          (entry) => entry.requestId === data.requestId,
        );
        if (existing) {
          attempt = existing;
          return false;
        }
        for (const input of data.inputs) {
          const item = getCosmetic(input.itemId)!;
          const protectedCopy = isCosmeticInUse(current, item) ? 1 : 0;
          if ((current.inventory[item.id] ?? 0) - protectedCopy < input.count)
            throw new Error(
              "Предметов недостаточно. Используемый экземпляр и последняя копия эмоции защищены",
            );
        }
        const roll = randomInt(10_000);
        attempt = {
          requestId: data.requestId,
          inputs: data.inputs.map(({ itemId, count }) => ({ itemId, count })),
          targetItemId: data.targetItemId,
          ...quote,
          roll,
          success: roll < quote.chanceBasisPoints,
          createdAt: Date.now(),
        };
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
        created = true;
      });
      if (created) publishProfile(key, io);
      if (created && attempt.success)
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
  paying?: boolean;
  rewardKeys?: Set<string>;
  winnerKeys?: Set<string>;
  retry?: NodeJS.Timeout;
}
const rounds = new WeakMap<Room, ProfileRound>();
async function payRound(round: ProfileRound, io: IOServer): Promise<void> {
  if (round.paid || round.paying || !round.rewardKeys) return;
  round.paying = true;
  const keys = round.rewardKeys;
  try {
    await transaction([...keys], (draft) => {
      if (draft.rewardedMatches.has(round.id)) return false;
      for (const key of keys) {
        const profile = draft.profiles.get(key);
        if (!profile) continue;
        profile.coins += GAME_REWARD;
        profile.completedGames += 1;
        if (round.winnerKeys?.has(key)) profile.wins += 1;
      }
      draft.rewardedMatches.add(round.id);
    });
    round.paid = true;
    clearTimeout(round.retry);
    for (const key of keys) publishProfile(key, io);
  } catch {
    if (round.retry) return;
    console.warn("Game reward could not be persisted; retrying shortly.");
    round.retry = setTimeout(() => {
      round.retry = undefined;
      void payRound(round, io);
    }, 5000);
    round.retry.unref();
  } finally {
    round.paying = false;
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
  void payRound(round, io);
}
