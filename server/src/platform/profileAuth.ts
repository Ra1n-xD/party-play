import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "crypto";
import type { Socket } from "socket.io";
import type { ClientEvents, ServerEvents } from "../../../shared/types.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  type ProfileAccountSnapshot,
  type ProfileCredentials,
  type ProfileRegistration,
  type ProfileSession,
} from "../../../shared/platform/auth.js";
import {
  BASIC_ITEMS,
  INITIAL_COINS,
  nicknameKey,
  normalizeNickname,
  type ProfileReply,
} from "../../../shared/platform/cosmetics.js";
import { getSocketClientIdentity } from "../clientIdentity.js";
import {
  assertProfileStorage,
  profileStore,
  profileTransaction,
  type StoredSession,
} from "./profileStorage.js";
import type { IOServer } from "./gameModule.js";
import { getAllRooms } from "./roomManager.js";

type IOSocket = Socket<ClientEvents, ServerEvents>;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const limits = new Map<string, { count: number; until: number }>();
let passwordJobs = 0;
const updatingAccounts = new Set<string>();

export function isProfileAccountUpdating(socket: IOSocket): boolean {
  return updatingAccounts.has(socket.data.profileKey);
}

function accountSnapshot(id: string): ProfileAccountSnapshot {
  const account = profileStore.accounts.get(id)!;
  return {
    profile: profileStore.profiles.get(id)!,
    account: { email: account.email ?? "", testParticipant: account.testParticipant ?? true },
  };
}

function assertNicknameEditable(id: string): void {
  for (const room of getAllRooms().values()) {
    if (
      [...room.players.values()].some(
        (player) => player.profileKey === id && !player.kicked && !player.voluntarilyLeft,
      ) ||
      [...room.spectators.values()].some((spectator) => spectator.profileKey === id)
    )
      throw new Error("Для смены никнейма сначала выйдите из всех комнат, включая другие вкладки");
  }
}

function consumeLimit(key: string, max: number, window: number): void {
  const now = Date.now();
  for (const [storedKey, value] of limits) if (value.until <= now) limits.delete(storedKey);
  const entry = limits.get(key) ?? { count: 0, until: now + window };
  if (entry.count >= max || (!limits.has(key) && limits.size >= 20_000))
    throw new Error("Слишком много попыток. Попробуйте позже");
  entry.count++;
  limits.set(key, entry);
}
function derivePassword(password: string, salt: string): Promise<Buffer> {
  // OWASP scrypt profile: 32 MiB, N=2^15, r=8, p=3. Limit concurrent jobs as well as requests.
  if (passwordJobs >= 2)
    return Promise.reject(new Error("Сервер занят. Попробуйте через несколько секунд"));
  passwordJobs++;
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      Buffer.from(salt, "hex"),
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, result) => {
        passwordJobs--;
        if (error) reject(new Error("Не удалось проверить пароль. Попробуйте позже"));
        else resolve(result);
      },
    );
  });
}
function tokenHash(token: unknown): string | null {
  return typeof token === "string" && /^[0-9a-f]{64}$/.test(token)
    ? createHash("sha256").update(token).digest("hex")
    : null;
}
function findSession(hash: unknown): StoredSession | undefined {
  const session = typeof hash === "string" ? profileStore.sessions.get(hash) : undefined;
  return session && session.expiresAt > Date.now() && profileStore.accounts.has(session.accountId)
    ? session
    : undefined;
}
export function profileRoom(id: string): string {
  return `__profile_${id}`;
}
export function attachProfileSession(socket: IOSocket, next: (error?: Error) => void): void {
  const session = findSession(tokenHash(socket.handshake.auth?.profileSession));
  if (session) {
    socket.data.profileKey = session.accountId;
    socket.data.profileSessionHash = session.tokenHash;
  }
  next();
}
export function profileNicknameMatches(socket: IOSocket, nickname: string): boolean {
  if (!socket.data.profileKey) return true;
  const profile = profileStore.profiles.get(socket.data.profileKey);
  return !!profile && nicknameKey(profile.nickname) === nicknameKey(nickname);
}
export function assertProfileSession(socket: IOSocket, key: string): void {
  if (
    !socket.connected ||
    socket.data.profileKey !== key ||
    findSession(socket.data.profileSessionHash)?.accountId !== key
  )
    throw new Error("Сессия изменилась. Войдите в аккаунт и повторите действие");
}
function expireSocket(socket: IOSocket): void {
  if (socket.data.profileKey) socket.leave(profileRoom(socket.data.profileKey));
  socket.leave("__cosmetic_drops");
  delete socket.data.profileKey;
  delete socket.data.profileSessionHash;
  socket.emit("profile:expired");
  socket.disconnect(true);
}

export function registerProfileAuthHandlers(
  socket: IOSocket,
  io: IOServer,
  membershipNickname: () => string | null,
): void {
  let authenticating = false;
  let expirationTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleExpiration = () => {
    clearTimeout(expirationTimer);
    if (!socket.data.profileKey) return;
    const session = findSession(socket.data.profileSessionHash);
    if (!session) {
      expireSocket(socket);
      return;
    }
    expirationTimer = setTimeout(
      scheduleExpiration,
      Math.min(session.expiresAt - Date.now() + 1, 86_400_000),
    );
    expirationTimer.unref();
  };
  if (socket.data.profileKey) socket.join(profileRoom(socket.data.profileKey));
  scheduleExpiration();
  socket.on("disconnect", () => clearTimeout(expirationTimer));
  socket.use((_packet, next) => {
    if (socket.data.profileKey && !findSession(socket.data.profileSessionHash)) {
      expireSocket(socket);
      return;
    }
    next();
  });
  socket.on("profile:session", (reply) => {
    if (typeof reply !== "function") return;
    try {
      assertProfileStorage();
      const id = socket.data.profileKey as string | undefined;
      if (id) assertProfileSession(socket, id);
      reply({ ok: true, value: id ? accountSnapshot(id) : null });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });

  const authenticate = async (
    register: boolean,
    data: ProfileCredentials | ProfileRegistration,
    reply: (result: ProfileReply<ProfileSession>) => void,
  ) => {
    if (typeof reply !== "function") return;
    if (authenticating) {
      reply({ ok: false, error: "Дождитесь завершения предыдущей попытки" });
      return;
    }
    authenticating = true;
    socket.data.profileAuthBusy = true;
    try {
      assertProfileStorage();
      const ip = getSocketClientIdentity(socket);
      consumeLimit(`ip:${ip}`, 60, 10 * 60_000);
      if (register) consumeLimit(`register:${ip}`, 30, 60 * 60_000);
      if (membershipNickname())
        throw new Error("Сначала выйдите из комнаты, чтобы войти в аккаунт");
      if (socket.data.profileKey) throw new Error("Сначала выйдите из текущего аккаунта");
      const name = normalizeNickname(data?.nickname);
      const password = data?.password;
      const email = register ? normalizeEmail((data as ProfileRegistration)?.email) : "";
      if (email === null)
        throw new Error("Укажите корректную электронную почту или оставьте поле пустым");
      if (!name)
        throw new Error("Никнейм должен содержать от 1 до 20 символов без специальных знаков");
      if (
        typeof password !== "string" ||
        password.length < (register ? PASSWORD_MIN_LENGTH : 1) ||
        password.length > PASSWORD_MAX_LENGTH
      )
        throw new Error(
          register
            ? `Пароль должен содержать от ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символов`
            : "Неверный никнейм или пароль",
        );
      const key = nicknameKey(name);
      const accountLimit = `name:${createHash("sha256").update(key).digest("hex")}`;
      consumeLimit(accountLimit, 10, 10 * 60_000);
      const existing = [...profileStore.profiles.values()].find(
        (profile) => nicknameKey(profile.nickname) === key,
      );
      const stored = existing && profileStore.accounts.get(existing.id);
      let passwordHash: string | undefined;
      if (register) {
        if (existing)
          throw new Error("Этот никнейм уже занят. Выберите другой или войдите в аккаунт");
        const salt = randomBytes(16).toString("hex");
        const hash = await derivePassword(password, salt);
        passwordHash = `scrypt$32768$8$3$${salt}$${hash.toString("hex")}`;
      } else {
        // Unknown names cost the same password work as existing accounts.
        const parts = stored?.passwordHash.split("$");
        const actual = await derivePassword(password, parts?.[4] ?? "0".repeat(32));
        const expected = Buffer.from(parts?.[5] ?? "0".repeat(128), "hex");
        if (!timingSafeEqual(actual, expected) || !stored)
          throw new Error("Неверный никнейм или пароль");
      }
      if (!socket.connected) return;
      if (membershipNickname() || socket.data.profileKey)
        throw new Error("Состояние изменилось. Выйдите из комнаты и повторите вход");
      const id = register ? randomUUID() : stored!.id;
      const sessionToken = randomBytes(32).toString("hex");
      const hash = tokenHash(sessionToken)!;
      const now = Date.now();
      const expiresAt = now + SESSION_TTL;
      await profileTransaction([], (draft) => {
        if (!socket.connected || membershipNickname() || socket.data.profileKey)
          throw new Error("Состояние изменилось. Повторите вход");
        // Password hashing is asynchronous: recheck uniqueness inside the committed write.
        if (register) {
          if ([...draft.profiles.values()].some((profile) => nicknameKey(profile.nickname) === key))
            throw new Error("Этот никнейм уже занят. Выберите другой");
          draft.accounts.set(id, {
            id,
            passwordHash: passwordHash!,
            createdAt: now,
            email,
            testParticipant: true,
          });
          draft.profiles.set(id, {
            id,
            nickname: name,
            coins: INITIAL_COINS,
            completedGames: 0,
            wins: 0,
            inventory: Object.fromEntries(BASIC_ITEMS.map((item) => [item, 1])),
            equipped: { avatar: "human", durak: "classic", uno: "classic" },
            recentOpenings: [],
            recentUpgrades: [],
          });
        } else if (
          draft.accounts.get(id)?.passwordHash !== stored!.passwordHash ||
          nicknameKey(draft.profiles.get(id)?.nickname ?? "") !== key
        ) {
          throw new Error("Данные аккаунта изменились. Повторите вход");
        }
        for (const [sessionHash, session] of draft.sessions)
          if (session.expiresAt <= now) draft.sessions.delete(sessionHash);
        const sessions = [...draft.sessions.values()]
          .filter((session) => session.accountId === id)
          .sort((a, b) => a.createdAt - b.createdAt);
        for (const session of sessions.slice(0, Math.max(0, sessions.length - 9)))
          draft.sessions.delete(session.tokenHash);
        draft.sessions.set(hash, {
          tokenHash: hash,
          accountId: id,
          createdAt: now,
          expiresAt,
        });
      });
      if (!socket.connected) return;
      if (membershipNickname() || socket.data.profileKey)
        throw new Error("Состояние изменилось. Выйдите из комнаты и повторите вход");
      socket.data.profileKey = id;
      socket.data.profileSessionHash = hash;
      socket.join(profileRoom(id));
      scheduleExpiration();
      limits.delete(accountLimit);
      for (const peer of io.sockets.sockets.values())
        if (peer.data.profileKey && !findSession(peer.data.profileSessionHash)) expireSocket(peer);
      reply({
        ok: true,
        value: { ...accountSnapshot(id), sessionToken, expiresAt },
      });
    } catch (error) {
      if (socket.connected) reply({ ok: false, error: (error as Error).message });
    } finally {
      authenticating = false;
      socket.data.profileAuthBusy = false;
    }
  };
  socket.on("profile:register", (data, reply) => {
    void authenticate(true, data, reply);
  });
  socket.on("profile:login", (data, reply) => {
    void authenticate(false, data, reply);
  });
  socket.on("profile:update", async (data, reply) => {
    if (typeof reply !== "function") return;
    const id = socket.data.profileKey as string | undefined;
    if (!id) {
      reply({ ok: false, error: "Войдите в аккаунт" });
      return;
    }
    if (authenticating || updatingAccounts.has(id)) {
      reply({ ok: false, error: "Дождитесь завершения предыдущего изменения аккаунта" });
      return;
    }
    authenticating = true;
    socket.data.profileAuthBusy = true;
    updatingAccounts.add(id);
    try {
      assertProfileStorage();
      assertProfileSession(socket, id);
      consumeLimit(`update-ip:${getSocketClientIdentity(socket)}`, 30, 10 * 60_000);
      consumeLimit(`update-account:${id}`, 10, 10 * 60_000);
      const nickname = normalizeNickname(data?.nickname);
      const email = normalizeEmail(data?.email);
      const password = data?.currentPassword;
      const newPassword = data?.newPassword;
      if (!nickname)
        throw new Error("Никнейм должен содержать от 1 до 20 символов без специальных знаков");
      if (email === null || typeof data?.email !== "string")
        throw new Error("Укажите корректную электронную почту или оставьте поле пустым");
      if (
        newPassword !== undefined &&
        (typeof newPassword !== "string" ||
          newPassword.length < PASSWORD_MIN_LENGTH ||
          newPassword.length > PASSWORD_MAX_LENGTH)
      )
        throw new Error(
          `Новый пароль должен содержать от ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символов`,
        );
      const stored = profileStore.accounts.get(id)!;
      let passwordHash = stored.passwordHash;
      if (newPassword !== undefined) {
        if (typeof password !== "string" || !password || password.length > PASSWORD_MAX_LENGTH)
          throw new Error("Введите текущий пароль для смены пароля");
        const parts = stored.passwordHash.split("$");
        const actual = await derivePassword(password, parts[4]);
        if (!timingSafeEqual(actual, Buffer.from(parts[5], "hex")))
          throw new Error("Текущий пароль указан неверно");
        const salt = randomBytes(16).toString("hex");
        passwordHash = `scrypt$32768$8$3$${salt}$${(await derivePassword(newPassword, salt)).toString("hex")}`;
      }
      await profileTransaction([id], (draft) => {
        assertProfileSession(socket, id);
        const current = draft.accounts.get(id)!;
        const profile = draft.profiles.get(id)!;
        if (newPassword !== undefined && current.passwordHash !== stored.passwordHash)
          throw new Error("Пароль уже изменился. Введите текущий пароль и повторите действие");
        if (profile.nickname !== nickname) {
          assertNicknameEditable(id);
          if (
            [...draft.profiles.values()].some(
              (other) => other.id !== id && nicknameKey(other.nickname) === nicknameKey(nickname),
            )
          )
            throw new Error("Этот никнейм уже занят. Выберите другой");
        }
        if (
          profile.nickname === nickname &&
          (current.email ?? "") === email &&
          newPassword === undefined
        )
          return false;
        profile.nickname = nickname;
        draft.accounts.set(id, {
          ...current,
          email,
          passwordHash: newPassword === undefined ? current.passwordHash : passwordHash,
        });
        if (newPassword !== undefined)
          for (const [hash, session] of draft.sessions)
            if (session.accountId === id && hash !== socket.data.profileSessionHash)
              draft.sessions.delete(hash);
      });
      // Only the authenticated account room receives contact data.
      const snapshot = accountSnapshot(id);
      for (const peer of io.sockets.sockets.values())
        if (peer.data.profileKey === id && !findSession(peer.data.profileSessionHash))
          expireSocket(peer);
      io.to(profileRoom(id)).emit("profile:account-snapshot", snapshot);
      if (socket.connected) reply({ ok: true, value: snapshot });
    } catch (error) {
      if (socket.connected) reply({ ok: false, error: (error as Error).message });
    } finally {
      updatingAccounts.delete(id);
      authenticating = false;
      socket.data.profileAuthBusy = false;
    }
  });
  socket.on("profile:logout", async (reply) => {
    if (typeof reply !== "function") return;
    if (authenticating) {
      reply({ ok: false, error: "Дождитесь завершения предыдущей попытки" });
      return;
    }
    if (membershipNickname()) {
      reply({ ok: false, error: "Сначала выйдите из комнаты" });
      return;
    }
    authenticating = true;
    socket.data.profileAuthBusy = true;
    try {
      const hash = socket.data.profileSessionHash as string | undefined;
      if (hash)
        await profileTransaction([], (draft) => {
          if (membershipNickname()) throw new Error("Сначала выйдите из комнаты");
          return draft.sessions.delete(hash);
        });
      reply({ ok: true, value: null });
      // Revoke this browser session on every open tab, including idle sockets.
      if (hash)
        for (const peer of io.sockets.sockets.values())
          if (peer.data.profileSessionHash === hash) expireSocket(peer);
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    } finally {
      authenticating = false;
      socket.data.profileAuthBusy = false;
    }
  });
}
