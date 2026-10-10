import type { Socket } from "socket.io";
import type { ClientEvents, ServerEvents } from "../../../shared/types.js";
import {
  DUEL_GAMES,
  DUEL_MAX_STAKE,
  DUEL_SETUP_MS,
  DUEL_TURN_MS,
  DUEL_WAIT_MS,
  type DuelDirectory,
  type DuelSnapshot,
  type DuelSummary,
} from "../../../shared/platform/duels.js";
import { createMemory, flipMemory } from "../games/memory/engine.js";
import { createBattleship, fireBattleship, seaBoard } from "../games/battleship/engine.js";
import { validFleet } from "../../../shared/games/battleship/rules.js";
import { assertProfileStorage, profileStore, profileTransaction } from "./profileStorage.js";
import { assertProfileSession, profileRoom } from "./profileAuth.js";
import type { DuelRecord } from "./duelRecord.js";
import type { IOServer } from "./gameModule.js";
import { isDeploymentDraining } from "./deploymentState.js";
import { getSocketClientIdentity } from "../clientIdentity.js";
import { generateRoomCode } from "../utils.js";
import { normalizeRoomCode } from "../../../shared/roomCode.js";

function newDuelCode(used: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = generateRoomCode();
    if (!used.has(code)) return code;
  }
  throw new Error("Не удалось создать код дуэли. Попробуйте позже");
}

/** A server outage must not turn into a timeout defeat before clients can reconnect. */
export async function restoreDuelDeadlines(): Promise<void> {
  if (
    ![...profileStore.duels.values()].some(
      (d) => d.phase !== "finished" || d.code === undefined || d.isPrivate === undefined,
    )
  )
    return;
  await profileTransaction([], (draft) => {
    const now = Date.now();
    const codes = new Set([...draft.duels.values()].flatMap((d) => (d.code ? [d.code] : [])));
    for (const previous of draft.duels.values()) {
      if (previous.phase === "finished" && previous.code && previous.isPrivate !== undefined)
        continue;
      const d = structuredClone(previous);
      d.code ??= newDuelCode(codes);
      codes.add(d.code);
      d.isPrivate ??= false;
      if (d.phase !== "finished") {
        d.deadline =
          now +
          (d.phase === "waiting"
            ? DUEL_WAIT_MS
            : d.phase === "setup"
              ? DUEL_SETUP_MS
              : DUEL_TURN_MS);
        if (d.game?.kind === "memory" && d.game.open.length === 2) d.game.revealUntil = now + 1800;
        d.revision++;
      }
      draft.duels.set(d.id, d);
    }
  });
}

type Store = Parameters<Parameters<typeof profileTransaction>[1]>[0];
const limits = new Map<string, { count: number; until: number }>();
function guard(socket: Socket) {
  const now = Date.now();
  for (const [key, bucket] of limits) if (bucket.until <= now) limits.delete(key);
  for (const [key, max] of [
    [`ip:${getSocketClientIdentity(socket)}`, 900],
    [`account:${socket.data.profileKey}`, 240],
  ] as const) {
    const bucket = limits.get(key) ?? { count: 0, until: now + 60_000 };
    if (++bucket.count > max || limits.size > 20000)
      throw new Error("Слишком много действий. Подождите минуту");
    limits.set(key, bucket);
  }
}
function summary(d: DuelRecord): DuelSummary {
  return {
    id: d.id,
    code: d.code!,
    isPrivate: d.isPrivate === true,
    gameId: d.gameId,
    stake: d.stake,
    phase: d.phase,
    revision: d.revision,
    deadline: d.deadline,
    winnerId: d.winnerId,
    reason: d.reason,
    players: d.players.map((id) => ({
      id,
      name: profileStore.profiles.get(id)?.nickname ?? "Игрок",
    })),
  };
}
function projection(d: DuelRecord, viewer: string): DuelSnapshot {
  const game = d.game;
  const own = d.players.indexOf(viewer);
  return {
    ...summary(d),
    turnId: d.phase === "playing" && game ? d.players[game.turn] : null,
    memory:
      game?.kind === "memory"
        ? {
            open: [...game.open],
            cards: game.cards.map((value, i) =>
              game.matched[i] ||
              (game.open.includes(i) && (game.open.length < 2 || Date.now() < game.revealUntil))
                ? value
                : null,
            ),
            matched: [...game.matched],
            scores: [...game.scores],
            revealUntil: game.revealUntil,
          }
        : null,
    battleship:
      game?.kind === "battleship"
        ? {
            boards: [seaBoard(game, 0), seaBoard(game, 1)],
            ownShips: own >= 0 ? game.ships[own] : null,
            ready: [...game.ready],
          }
        : null,
  };
}
function directory(key: string, id?: string, code?: string): DuelDirectory {
  assertProfileStorage();
  const all = [...profileStore.duels.values()].sort((a, b) => b.createdAt - a.createdAt);
  const mine = all.filter((d) => d.players.includes(key));
  const selected = id
    ? profileStore.duels.get(id)
    : code
      ? all.find((d) => d.code === code)
      : mine.find((d) => d.phase !== "finished");
  if ((code || (id && id !== "list")) && !selected)
    throw new Error("Дуэль не найдена. Проверьте код");
  if (selected?.isPrivate && !selected.players.includes(key) && selected.code !== code)
    throw new Error("Для приватной дуэли нужен код приглашения");
  return {
    rooms: all
      .filter((d) => d.phase !== "finished" && !d.isPrivate)
      .slice(0, 50)
      .map(summary),
    mine: mine.slice(0, 10).map(summary),
    selected: selected ? projection(selected, key) : null,
    serverNow: Date.now(),
  };
}
function finish(draft: Store, d: DuelRecord, winner: string | null, reason: string) {
  if (d.phase === "finished") return;
  for (const id of d.players) {
    // Clone here as membership may have changed while this transaction waited in the queue.
    const profile = structuredClone(draft.profiles.get(id)!);
    const payout = winner ? (id === winner ? d.stake * d.players.length : 0) : d.stake;
    if (!Number.isSafeInteger(profile.coins + payout)) throw new Error("Достигнут предел монет");
    profile.coins += payout;
    if (d.players.length === 2) {
      profile.completedGames++;
      if (id === winner) profile.wins++;
    }
    draft.profiles.set(id, profile);
  }
  d.phase = "finished";
  d.winnerId = winner;
  d.reason = reason;
  d.revision++;
}
function expire(draft: Store, d: DuelRecord, now: number): boolean {
  if (d.phase === "finished" || now < d.deadline) return false;
  if (d.phase === "waiting") finish(draft, d, null, "Соперник не найден. Ставка возвращена.");
  else if (d.phase === "setup" && d.game?.kind === "battleship") {
    const ready = d.game.ready;
    const winner = ready[0] !== ready[1] ? d.players[ready[0] ? 0 : 1] : null;
    finish(
      draft,
      d,
      winner,
      winner ? "Соперник не подготовил флот вовремя." : "Флоты не готовы. Ставки возвращены.",
    );
  } else if (d.game) finish(draft, d, d.players[1 - d.game.turn], "Время хода истекло.");
  return true;
}
function publishDuels(io: IOServer) {
  for (const viewer of io.sockets.sockets.values()) {
    if (!viewer.data.duelSubscribed) continue;
    try {
      const key = viewer.data.profileKey as string;
      assertProfileSession(viewer, key);
      viewer.emit(
        "duels:snapshot",
        directory(key, viewer.data.duelViewId ?? undefined, viewer.data.duelViewCode ?? undefined),
      );
    } catch {
      viewer.data.duelSubscribed = false;
    }
  }
}

function publishProfiles(io: IOServer, ids: string[]) {
  for (const id of ids) {
    const p = profileStore.profiles.get(id);
    if (p) io.to(profileRoom(id)).emit("profile:snapshot", p);
  }
}
let timerStarted = false;
export function registerDuelHandlers(socket: Socket<ClientEvents, ServerEvents>, io: IOServer) {
  if (!timerStarted) {
    timerStarted = true;
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      const due = [...profileStore.duels.values()].filter(
        (d) => d.phase !== "finished" && d.deadline <= Date.now(),
      );
      if (!due.length) return;
      running = true;
      try {
        const ids = [...new Set(due.flatMap((d) => d.players))];
        await profileTransaction(ids, (draft) => {
          let changed = false;
          for (const old of due) {
            const d = structuredClone(draft.duels.get(old.id)!);
            if (expire(draft, d, Date.now())) {
              draft.duels.set(d.id, d);
              changed = true;
            }
          }
          return changed;
        });
        publishProfiles(io, ids);
        publishDuels(io);
      } catch {
        /* A failed disk write leaves both escrow and game untouched; retry after recovery. */
      } finally {
        running = false;
      }
    }, 1000);
    timer.unref();
  }
  socket.on("duels:unsubscribe", () => {
    socket.data.duelSubscribed = false;
  });
  socket.on("duels:get", (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guard(socket);
      const key = socket.data.profileKey as string;
      assertProfileSession(socket, key);
      const id = typeof data?.id === "string" ? data.id : undefined;
      const code = data?.code === undefined ? undefined : normalizeRoomCode(data.code);
      if (code === null) throw new Error("Введите код из 4 латинских букв");
      const value = directory(key, id, code);
      socket.data.duelSubscribed = true;
      socket.data.duelViewId = value.selected?.id ?? id ?? null;
      socket.data.duelViewCode = code ?? null;
      reply({ ok: true, value });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
  socket.on("duels:command", async (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guard(socket);
      const key = socket.data.profileKey as string;
      assertProfileSession(socket, key);
      if (!data || typeof data !== "object") throw new Error("Некорректная команда");
      const id = data.type === "create" ? data.requestId : data.id;
      if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
        throw new Error("Некорректный номер дуэли");
      await profileTransaction([key], (draft) => {
        assertProfileSession(socket, key);
        const now = Date.now();
        const previous = draft.duels.get(id);
        const busy = () =>
          [...draft.duels.values()].some((d) => d.phase !== "finished" && d.players.includes(key));
        if (data.type === "create") {
          if (previous) {
            if (previous.players[0] !== key) throw new Error("Этот номер занят");
            return false;
          }
          if (isDeploymentDraining())
            throw new Error("Сервер обновляется. Создайте дуэль чуть позже");
          if (busy()) throw new Error("Сначала завершите текущую дуэль");
          if (
            !DUEL_GAMES.includes(data.gameId) ||
            !Number.isSafeInteger(data.stake) ||
            data.stake < 0 ||
            data.stake > DUEL_MAX_STAKE ||
            (data.isPrivate !== undefined && typeof data.isPrivate !== "boolean")
          )
            throw new Error("Некорректная игра или ставка");
          const profile = draft.profiles.get(key)!;
          if (profile.coins < data.stake) throw new Error("Не хватает монет");
          profile.coins -= data.stake;
          draft.duels.set(id, {
            id,
            code: newDuelCode(
              new Set([...draft.duels.values()].flatMap((d) => (d.code ? [d.code] : []))),
            ),
            isPrivate: data.isPrivate === true,
            gameId: data.gameId,
            stake: data.stake,
            players: [key],
            phase: "waiting",
            revision: 0,
            deadline: now + DUEL_WAIT_MS,
            createdAt: now,
            game: null,
            winnerId: null,
            reason: null,
          });
          return;
        }
        if (!previous) throw new Error("Дуэль не найдена");
        if (
          previous.isPrivate &&
          !previous.players.includes(key) &&
          (data.type !== "join" || normalizeRoomCode(data.code) !== previous.code)
        )
          throw new Error("Для приватной дуэли нужен код приглашения");
        const d = structuredClone(previous);
        if (expire(draft, d, now)) {
          draft.duels.set(id, d);
          return;
        }
        if (d.phase === "finished") return false;
        if (data.revision !== d.revision)
          throw new Error("Состояние изменилось. Повторите действие после обновления");
        if (data.type === "join") {
          if (d.players.includes(key)) return false;
          if (d.phase !== "waiting" || busy())
            throw new Error("Место занято или у вас уже есть дуэль");
          if (data.stake !== d.stake) throw new Error("Подтвердите текущую ставку");
          const profile = draft.profiles.get(key)!;
          if (profile.coins < d.stake) throw new Error("Не хватает монет");
          profile.coins -= d.stake;
          d.players.push(key);
          d.game = d.gameId === "memory" ? createMemory() : createBattleship();
          d.phase = d.gameId === "memory" ? "playing" : "setup";
          d.deadline = now + (d.phase === "setup" ? DUEL_SETUP_MS : DUEL_TURN_MS);
        } else {
          const actor = d.players.indexOf(key);
          if (actor < 0) throw new Error("Зритель не может делать ходы");
          if (data.type === "leave")
            finish(
              draft,
              d,
              d.players.length === 2 ? d.players[1 - actor] : null,
              d.players.length === 2 ? "Соперник сдался." : "Дуэль отменена. Ставка возвращена.",
            );
          else if (data.type === "play" && d.game && data.action) {
            const a = data.action,
              game = d.game;
            if (game.kind === "memory" && a.type === "flip" && d.phase === "playing") {
              if (flipMemory(game, actor, a.cell, now))
                finish(
                  draft,
                  d,
                  game.scores[0] === game.scores[1]
                    ? null
                    : d.players[game.scores[0] > game.scores[1] ? 0 : 1],
                  "Все пары найдены.",
                );
              else if (game.open.length === 2) d.deadline = now + DUEL_TURN_MS + 1800;
            } else if (game.kind === "battleship") {
              if (
                d.phase === "setup" &&
                !game.ready[actor] &&
                a.type === "fleet" &&
                validFleet(a.ships)
              )
                game.ships[actor] = a.ships;
              else if (d.phase === "setup" && a.type === "ready") {
                game.ready[actor] = true;
                if (game.ready.every(Boolean)) {
                  d.phase = "playing";
                  d.deadline = now + DUEL_TURN_MS;
                }
              } else if (d.phase === "playing" && a.type === "fire") {
                if (fireBattleship(game, actor, a.cell))
                  finish(draft, d, key, "Все корабли соперника потоплены.");
                else d.deadline = now + DUEL_TURN_MS;
              } else throw new Error("Это действие сейчас недоступно");
            } else throw new Error("Это действие сейчас недоступно");
          } else throw new Error("Некорректное действие");
        }
        d.revision++;
        draft.duels.set(id, d);
      });
      socket.data.duelViewId = id;
      socket.data.duelViewCode = profileStore.duels.get(id)?.code ?? null;
      publishProfiles(io, profileStore.duels.get(id)?.players ?? [key]);
      publishDuels(io);
      assertProfileSession(socket, key);
      reply({ ok: true, value: directory(key, id, socket.data.duelViewCode ?? undefined) });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
}
