import { createHash, randomInt, randomUUID } from "crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import { basename, dirname, resolve } from "path";
import type { Socket } from "socket.io";
import {
  BASIC_ITEMS,
  CASE_COST,
  CASE_ITEMS,
  GAME_REWARD,
  RARITIES,
  getCosmetic,
  nicknameKey,
  normalizeNickname,
  type ProfileSnapshot,
  type CaseOpening,
} from "../../../shared/platform/cosmetics.js";
import type { ClientEvents, ServerEvents } from "../../../shared/types.js";
import { getUpgradeQuote, type UpgradeAttempt } from "../../../shared/platform/upgrades.js";
import type { IOServer } from "./gameModule.js";
import { getAllRooms, type Player, type Room } from "./roomManager.js";

type IOSocket = Socket<ClientEvents, ServerEvents>;
const storagePath =
  process.env.PARTYPLAY_PROFILES_FILE?.trim() ||
  resolve(
    process.cwd(),
    basename(process.cwd()) === "server" ? ".data/profiles.json" : "server/.data/profiles.json",
  );
let profiles = new Map<string, ProfileSnapshot>();
let rewardedMatches = new Set<string>();
let storageHealthy = true;
try {
  const data = JSON.parse(readFileSync(storagePath, "utf8"));
  if (data.version !== 1 || !Array.isArray(data.profiles) || !Array.isArray(data.rewardedMatches))
    throw new Error("Invalid profile storage");
  for (const profile of data.profiles as ProfileSnapshot[]) {
    if (
      !normalizeNickname(profile.nickname) ||
      !Number.isSafeInteger(profile.coins) ||
      profile.coins < 0 ||
      !Number.isSafeInteger(profile.completedGames) ||
      profile.completedGames < 0 ||
      !profile.inventory ||
      !profile.equipped ||
      !Array.isArray(profile.recentOpenings)
    )
      throw new Error("Invalid profile");
    for (const [id, count] of Object.entries(profile.inventory))
      if (!getCosmetic(id) || !Number.isSafeInteger(count) || count < 1)
        throw new Error("Invalid inventory");
    for (const id of BASIC_ITEMS) if (!profile.inventory[id]) throw new Error("Missing basic item");
    for (const kind of ["avatar", "durak", "uno"] as const)
      if (!profile.inventory[`${kind}:${profile.equipped[kind]}`])
        throw new Error("Invalid equipped item");
    if (
      profile.recentOpenings.some(
        (opening) =>
          !getCosmetic(opening.itemId) ||
          typeof opening.requestId !== "string" ||
          !Number.isFinite(opening.openedAt),
      )
    )
      throw new Error("Invalid case history");
    profile.recentUpgrades ??= [];
    if (
      !Array.isArray(profile.recentUpgrades) ||
      profile.recentUpgrades.some((attempt) => {
        const quote = getUpgradeQuote(attempt.inputs, attempt.targetItemId);
        return (
          !quote ||
          typeof attempt.requestId !== "string" ||
          !Number.isFinite(attempt.createdAt) ||
          !Number.isInteger(attempt.roll) ||
          attempt.roll < 0 ||
          attempt.roll >= 10_000 ||
          !Number.isInteger(attempt.chanceBasisPoints) ||
          attempt.chanceBasisPoints < 1 ||
          attempt.chanceBasisPoints > 9000 ||
          attempt.success !== attempt.roll < attempt.chanceBasisPoints
        );
      })
    )
      throw new Error("Invalid upgrade history");
    const key = nicknameKey(profile.nickname);
    if (profiles.has(key)) throw new Error("Duplicate profile");
    profiles.set(key, profile);
  }
  if (data.rewardedMatches.some((id: unknown) => typeof id !== "string"))
    throw new Error("Invalid reward history");
  rewardedMatches = new Set(data.rewardedMatches);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    storageHealthy = false;
    console.error("Profile storage is unreadable; profile operations disabled to preserve data.");
  }
}

function transaction(change: () => void): void {
  if (!storageHealthy) throw new Error("Хранилище профилей недоступно. Попробуйте позже");
  const previousProfiles = profiles;
  const previousMatches = rewardedMatches;
  profiles = new Map(Array.from(profiles, ([key, profile]) => [key, structuredClone(profile)]));
  rewardedMatches = new Set(rewardedMatches);
  const temporaryPath = `${storagePath}.${process.pid}.tmp`;
  try {
    change();
    mkdirSync(dirname(storagePath), { recursive: true, mode: 0o700 });
    const fd = openSync(temporaryPath, "w", 0o600);
    try {
      writeFileSync(
        fd,
        JSON.stringify({
          version: 1,
          profiles: [...profiles.values()],
          rewardedMatches: [...rewardedMatches],
        }),
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporaryPath, storagePath);
  } catch {
    profiles = previousProfiles;
    rewardedMatches = previousMatches;
    throw new Error("Не удалось сохранить профиль. Монеты и предметы не изменены");
  }
}

function profileRoom(key: string): string {
  return `__profile_${createHash("sha256").update(key).digest("hex")}`;
}
export function getProfile(name: string): ProfileSnapshot | undefined {
  return profiles.get(nicknameKey(name));
}
export function applyProfileToPlayer(player: Player): void {
  const profile = getProfile(player.owner.name);
  player.profileKey = profile ? nicknameKey(profile.nickname) : null;
  player.avatarId = profile?.equipped.avatar ?? "human";
  player.cardSkins = profile
    ? { durak: profile.equipped.durak, uno: profile.equipped.uno }
    : { durak: "classic", uno: "classic" };
}
function publishProfile(key: string, io: IOServer): void {
  const profile = profiles.get(key);
  if (profile) io.to(profileRoom(key)).emit("profile:snapshot", profile);
}
export function equipProfileItem(key: string, itemId: string, io: IOServer): ProfileSnapshot {
  const item = getCosmetic(itemId);
  const profile = profiles.get(key);
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
    const current = profiles.get(key)!;
    if (item.kind === "avatar") current.equipped.avatar = item.avatarId!;
    else current.equipped[item.kind] = item.cardSkinId!;
  });
  publishProfile(key, io);
  for (const room of getAllRooms().values())
    for (const player of room.players.values()) {
      if (player.profileKey === key && !player.kicked && !player.voluntarilyLeft)
        applyProfileToPlayer(player);
    }
  return profiles.get(key)!;
}

export function registerProfileHandlers(
  socket: IOSocket,
  io: IOServer,
  membershipNickname: () => string | null,
  publishRooms: () => void,
): void {
  let requests: number[] = [];
  const guard = () => {
    const now = Date.now();
    requests = requests.filter((time) => now - time < 60_000);
    if (requests.length >= 40) throw new Error("Слишком много действий. Подождите минуту");
    requests.push(now);
  };
  socket.on("profile:login", (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guard();
      const name = normalizeNickname(data?.nickname);
      if (!name)
        throw new Error("Никнейм должен содержать от 1 до 20 символов без специальных знаков");
      const key = nicknameKey(name);
      const memberName = membershipNickname();
      if (memberName && nicknameKey(memberName) !== key)
        throw new Error("Сначала выйдите из комнаты, чтобы сменить ник");
      if (!storageHealthy) throw new Error("Хранилище профилей недоступно");
      if (!profiles.has(key))
        transaction(() =>
          profiles.set(key, {
            nickname: name,
            coins: 5,
            completedGames: 0,
            inventory: Object.fromEntries(BASIC_ITEMS.map((id) => [id, 1])),
            equipped: { avatar: "human", durak: "classic", uno: "classic" },
            recentOpenings: [],
            recentUpgrades: [],
          }),
        );
      if (socket.data.profileKey) socket.leave(profileRoom(socket.data.profileKey));
      socket.data.profileKey = key;
      socket.join(profileRoom(key));
      reply({ ok: true, value: profiles.get(key)! });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
  socket.on("profile:logout", (reply) => {
    if (typeof reply !== "function") return;
    if (membershipNickname()) return reply({ ok: false, error: "Сначала выйдите из комнаты" });
    if (socket.data.profileKey) socket.leave(profileRoom(socket.data.profileKey));
    delete socket.data.profileKey;
    reply({ ok: true, value: null });
  });
  socket.on("profile:equip", (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guard();
      if (!socket.data.profileKey || typeof data?.itemId !== "string")
        throw new Error("Сначала войдите по нику");
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
      if (!key || !profiles.has(key)) throw new Error("Сначала войдите по нику");
      if (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId))
        throw new Error("Некорректный запрос открытия");
      const existing = profiles
        .get(key)!
        .recentOpenings.find((opening) => opening.requestId === requestId);
      if (existing)
        return reply({ ok: true, value: { profile: profiles.get(key)!, opening: existing } });
      if (profiles.get(key)!.coins < CASE_COST)
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
        duplicate: !!profiles.get(key)!.inventory[item.id],
        openedAt: Date.now(),
      };
      transaction(() => {
        const profile = profiles.get(key)!;
        profile.coins -= CASE_COST;
        profile.inventory[item.id] = (profile.inventory[item.id] ?? 0) + 1;
        profile.recentOpenings.unshift(opening);
        profile.recentOpenings = profile.recentOpenings.slice(0, 100);
      });
      publishProfile(key, io);
      reply({ ok: true, value: { profile: profiles.get(key)!, opening } });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
  socket.on("profile:upgrade", (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guard();
      const key = socket.data.profileKey as string | undefined;
      const profile = key ? profiles.get(key) : undefined;
      if (!key || !profile) throw new Error("Сначала войдите по нику");
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
        const current = profiles.get(key)!;
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
      reply({ ok: true, value: { profile: profiles.get(key)!, attempt } });
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
  retry?: NodeJS.Timeout;
}
const rounds = new WeakMap<Room, ProfileRound>();
function payRound(round: ProfileRound, io: IOServer): void {
  if (round.paid || !round.rewardKeys) return;
  const keys = round.rewardKeys;
  try {
    if (!rewardedMatches.has(round.id))
      transaction(() => {
        for (const key of keys) {
          const profile = profiles.get(key);
          if (!profile) continue;
          profile.coins += GAME_REWARD;
          profile.completedGames += 1;
        }
        rewardedMatches.add(round.id);
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
  const state = room.gameState as {
    result?: { type: string };
    statusBySeatId?: Record<string, string>;
  } | null;
  const complete =
    room.gameId === "bunker"
      ? room.completedNaturally
      : state?.result && state.result.type !== "aborted";
  if (!complete) {
    round.paid = true;
    return;
  }
  round.rewardKeys ??= new Set(
    [...round.players]
      .filter(([id, key]) => {
        const player = room.players.get(id);
        return (
          player &&
          player.profileKey === key &&
          !player.kicked &&
          !player.voluntarilyLeft &&
          state?.statusBySeatId?.[id] !== "excluded"
        );
      })
      .map(([, key]) => key),
  );
  payRound(round, io);
}
