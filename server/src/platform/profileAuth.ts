import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "crypto";
import type { Socket } from "socket.io";
import type { ClientEvents, ServerEvents } from "../../../shared/types.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type ProfileCredentials,
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

type IOSocket = Socket<ClientEvents, ServerEvents>;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const limits = new Map<string, { count: number; until: number }>();
let passwordJobs = 0;

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
      reply({ ok: true, value: profileStore.profiles.get(socket.data.profileKey) ?? null });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });

  const authenticate = async (
    register: boolean,
    data: ProfileCredentials,
    reply: (result: ProfileReply<ProfileSession>) => void,
  ) => {
    if (typeof reply !== "function") return;
    if (authenticating) {
      reply({ ok: false, error: "Дождитесь завершения предыдущей попытки" });
      return;
    }
    authenticating = true;
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
      profileTransaction(() => {
        // Password hashing is asynchronous: recheck uniqueness inside the committed write.
        if (register) {
          if (
            [...profileStore.profiles.values()].some(
              (profile) => nicknameKey(profile.nickname) === key,
            )
          )
            throw new Error("Nickname already registered");
          profileStore.accounts.set(id, { id, passwordHash: passwordHash!, createdAt: now });
          profileStore.profiles.set(id, {
            id,
            nickname: name,
            coins: INITIAL_COINS,
            completedGames: 0,
            inventory: Object.fromEntries(BASIC_ITEMS.map((item) => [item, 1])),
            equipped: { avatar: "human", durak: "classic", uno: "classic" },
            recentOpenings: [],
            recentUpgrades: [],
          });
        }
        for (const [sessionHash, session] of profileStore.sessions)
          if (session.expiresAt <= now) profileStore.sessions.delete(sessionHash);
        const sessions = [...profileStore.sessions.values()]
          .filter((session) => session.accountId === id)
          .sort((a, b) => a.createdAt - b.createdAt);
        for (const session of sessions.slice(0, Math.max(0, sessions.length - 9)))
          profileStore.sessions.delete(session.tokenHash);
        profileStore.sessions.set(hash, {
          tokenHash: hash,
          accountId: id,
          createdAt: now,
          expiresAt,
        });
      });
      socket.data.profileKey = id;
      socket.data.profileSessionHash = hash;
      socket.join(profileRoom(id));
      scheduleExpiration();
      limits.delete(accountLimit);
      for (const peer of io.sockets.sockets.values())
        if (peer.data.profileKey && !findSession(peer.data.profileSessionHash)) expireSocket(peer);
      reply({
        ok: true,
        value: { profile: profileStore.profiles.get(id)!, sessionToken, expiresAt },
      });
    } catch (error) {
      if (socket.connected) reply({ ok: false, error: (error as Error).message });
    } finally {
      authenticating = false;
    }
  };
  socket.on("profile:register", (data, reply) => {
    void authenticate(true, data, reply);
  });
  socket.on("profile:login", (data, reply) => {
    void authenticate(false, data, reply);
  });
  socket.on("profile:logout", (reply) => {
    if (typeof reply !== "function") return;
    if (membershipNickname()) {
      reply({ ok: false, error: "Сначала выйдите из комнаты" });
      return;
    }
    try {
      const hash = socket.data.profileSessionHash as string | undefined;
      if (hash)
        profileTransaction(() => {
          profileStore.sessions.delete(hash);
        });
      reply({ ok: true, value: null });
      // Revoke this browser session on every open tab, including idle sockets.
      if (hash)
        for (const peer of io.sockets.sockets.values())
          if (peer.data.profileSessionHash === hash) expireSocket(peer);
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
}
