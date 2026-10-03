import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { basename, dirname, resolve } from "path";
import {
  BASIC_ITEMS,
  getCosmetic,
  nicknameKey,
  normalizeNickname,
  type ProfileSnapshot,
} from "../../../shared/platform/cosmetics.js";
import { getUpgradeQuote } from "../../../shared/platform/upgrades.js";

export interface StoredAccount {
  id: string;
  passwordHash: string;
  createdAt: number;
}
export interface StoredSession {
  tokenHash: string;
  accountId: string;
  createdAt: number;
  expiresAt: number;
}
interface ProfileStore {
  profiles: Map<string, ProfileSnapshot>;
  accounts: Map<string, StoredAccount>;
  sessions: Map<string, StoredSession>;
  rewardedMatches: Set<string>;
}
function emptyStore(): ProfileStore {
  return {
    profiles: new Map(),
    accounts: new Map(),
    sessions: new Map(),
    rewardedMatches: new Set(),
  };
}
export let profileStore = emptyStore();
export let profileStorageHealthy = true;
export let profileStoreRevision = 0;
const storagePath =
  process.env.PARTYPLAY_PROFILES_FILE?.trim() ||
  resolve(
    process.cwd(),
    basename(process.cwd()) === "server" ? ".data/profiles.json" : "server/.data/profiles.json",
  );
const lockPath = `${storagePath}.lock`;
const STORAGE_VERSION = 3;
let savedCurrentFormat = false;

// A second Node process must not overwrite the first process's in-memory accounts.
mkdirSync(dirname(storagePath), { recursive: true, mode: 0o700 });
try {
  const pid = Number(readFileSync(lockPath, "utf8"));
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("Invalid profile storage lock");
  try {
    process.kill(pid, 0);
    throw new Error("Profile storage is already open by another process");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    unlinkSync(lockPath);
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const lock = openSync(lockPath, "wx", 0o600);
try {
  writeFileSync(lock, String(process.pid));
} finally {
  closeSync(lock);
}
process.once("exit", () => {
  try {
    if (readFileSync(lockPath, "utf8") === String(process.pid)) unlinkSync(lockPath);
  } catch {
    /* A missing lock needs no cleanup. */
  }
});

function serialize(store: ProfileStore): string {
  return JSON.stringify({
    version: STORAGE_VERSION,
    profiles: [...store.profiles.values()],
    accounts: [...store.accounts.values()],
    sessions: [...store.sessions.values()],
    rewardedMatches: [...store.rewardedMatches],
  });
}
function writeAtomic(path: string, value: string): void {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  const fd = openSync(temporaryPath, "w", 0o600);
  try {
    writeFileSync(fd, value);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporaryPath, path);
}
export function assertProfileStorage(): void {
  if (!profileStorageHealthy) throw new Error("Хранилище профилей недоступно. Попробуйте позже");
}
export function profileTransaction(change: () => void): void {
  assertProfileStorage();
  const previous = profileStore;
  profileStore = structuredClone(previous);
  try {
    change();
    // Only back up snapshots from the current account generation.
    if (savedCurrentFormat) writeAtomic(`${storagePath}.bak`, serialize(previous));
    writeAtomic(storagePath, serialize(profileStore));
    savedCurrentFormat = true;
    profileStoreRevision++;
  } catch {
    profileStore = previous;
    throw new Error("Не удалось сохранить профиль. Попробуйте позже");
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
try {
  const data = JSON.parse(readFileSync(storagePath, "utf8"));
  const legacyStore =
    Array.isArray(data.profiles) &&
    Array.isArray(data.rewardedMatches) &&
    (data.version === 1 ||
      (data.version === 2 && Array.isArray(data.accounts) && Array.isArray(data.sessions)));
  if (legacyStore) {
    // Explicit 6.0 reset: remove old accounts, sessions, balances, rankings and receipts once.
    // Delete the previous backup first so it cannot retain the discarded accounts.
    try {
      unlinkSync(`${storagePath}.bak`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    profileTransaction(() => {});
    console.info("Previous accounts reset; new accounts use profile storage version 3.");
  } else {
    if (
      data.version !== STORAGE_VERSION ||
      !Array.isArray(data.profiles) ||
      !Array.isArray(data.accounts) ||
      !Array.isArray(data.sessions) ||
      !Array.isArray(data.rewardedMatches)
    )
      throw new Error("Invalid profile storage");
    const loaded = emptyStore();
    const nicknames = new Set<string>();
    for (const profile of data.profiles as ProfileSnapshot[]) {
      if (
        !profile ||
        !uuid.test(profile.id) ||
        normalizeNickname(profile.nickname) !== profile.nickname ||
        !Number.isSafeInteger(profile.coins) ||
        profile.coins < 0 ||
        !Number.isSafeInteger(profile.completedGames) ||
        profile.completedGames < 0 ||
        !profile.inventory ||
        !profile.equipped ||
        !Array.isArray(profile.recentOpenings)
      )
        throw new Error("Invalid profile");
      if (
        !Number.isSafeInteger(profile.wins) ||
        profile.wins < 0 ||
        profile.wins > profile.completedGames
      )
        throw new Error("Invalid profile wins");
      for (const [id, count] of Object.entries(profile.inventory))
        if (!getCosmetic(id) || !Number.isSafeInteger(count) || count < 1)
          throw new Error("Invalid inventory");
      for (const id of BASIC_ITEMS)
        if (!profile.inventory[id]) throw new Error("Missing basic item");
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
      if (nicknames.has(key) || loaded.profiles.has(profile.id))
        throw new Error("Duplicate profile");
      nicknames.add(key);
      loaded.profiles.set(profile.id, profile);
    }
    for (const account of data.accounts as StoredAccount[]) {
      if (
        !account ||
        !loaded.profiles.has(account.id) ||
        loaded.accounts.has(account.id) ||
        !Number.isFinite(account.createdAt) ||
        !/^scrypt\$32768\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(account.passwordHash)
      )
        throw new Error("Invalid account");
      loaded.accounts.set(account.id, account);
    }
    if (loaded.accounts.size !== loaded.profiles.size) throw new Error("Profile has no account");
    for (const session of data.sessions as StoredSession[]) {
      if (
        !session ||
        !hash.test(session.tokenHash) ||
        !loaded.accounts.has(session.accountId) ||
        loaded.sessions.has(session.tokenHash) ||
        !Number.isFinite(session.createdAt) ||
        !Number.isFinite(session.expiresAt) ||
        session.expiresAt <= session.createdAt
      )
        throw new Error("Invalid session");
      if (session.expiresAt > Date.now()) loaded.sessions.set(session.tokenHash, session);
    }
    if (data.rewardedMatches.some((id: unknown) => typeof id !== "string"))
      throw new Error("Invalid reward history");
    loaded.rewardedMatches = new Set(data.rewardedMatches);
    profileStore = loaded;
    savedCurrentFormat = true;
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    profileStorageHealthy = false;
    profileStore = emptyStore();
    console.error("Profile storage is unreadable; account operations disabled to preserve data.");
  }
}
