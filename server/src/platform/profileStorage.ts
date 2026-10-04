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
import { copyFile, open, rename, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "path";
import { isDeepStrictEqual } from "node:util";
import {
  BASIC_ITEMS,
  getCosmetic,
  nicknameKey,
  normalizeNickname,
  type ProfileSnapshot,
} from "../../../shared/platform/cosmetics.js";
import { getUpgradeQuote, type UpgradeAttempt } from "../../../shared/platform/upgrades.js";
import { getCase } from "../../../shared/platform/cases.js";

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
  upgradeReceipts: Map<string, { profileId: string; attempt: UpgradeAttempt }>;
}
function emptyStore(): ProfileStore {
  return {
    profiles: new Map(),
    accounts: new Map(),
    sessions: new Map(),
    rewardedMatches: new Set(),
    upgradeReceipts: new Map(),
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
    upgradeReceipts: [...store.upgradeReceipts.values()],
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
let transactionTail = Promise.resolve();
let pendingWrites = 0;
let closing = false;
let recoveryTimer: NodeJS.Timeout | undefined;

// Yield bounded chunks to asynchronous file IO instead of stringifying the whole store at once.
function* serializeChunks(store: ProfileStore): Generator<string> {
  yield `{"version":${STORAGE_VERSION}`;
  const sections: [string, Iterable<unknown>][] = [
    ["profiles", store.profiles.values()],
    ["accounts", store.accounts.values()],
    ["sessions", store.sessions.values()],
    ["rewardedMatches", store.rewardedMatches],
    ["upgradeReceipts", store.upgradeReceipts.values()],
  ];
  for (const [name, values] of sections) {
    yield `,"${name}":[`;
    let chunk = "";
    let separator = "";
    for (const value of values) {
      chunk += separator + JSON.stringify(value);
      separator = ",";
      if (chunk.length >= 64 * 1024) {
        yield chunk;
        chunk = "";
      }
    }
    yield `${chunk}]`;
  }
  yield "}";
}

async function persistStore(store: ProfileStore): Promise<void> {
  const temporaryPath = `${storagePath}.${process.pid}.tmp`;
  const backupTemporaryPath = `${storagePath}.bak.${process.pid}.tmp`;
  try {
    if (savedCurrentFormat) {
      // The previous committed snapshot already exists on disk; do not serialize it again.
      await copyFile(storagePath, backupTemporaryPath);
      const backup = await open(backupTemporaryPath, "r+");
      try {
        await backup.chmod(0o600);
        await backup.sync();
      } finally {
        await backup.close();
      }
      await rename(backupTemporaryPath, `${storagePath}.bak`);
    }
    const file = await open(temporaryPath, "w", 0o600);
    try {
      for (const chunk of serializeChunks(store)) await file.writeFile(chunk, { encoding: "utf8" });
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, storagePath);
    savedCurrentFormat = true;
  } finally {
    await Promise.all([
      unlink(temporaryPath).catch(() => {}),
      unlink(backupTemporaryPath).catch(() => {}),
    ]);
  }
}

function scheduleStorageRecovery(): void {
  if (recoveryTimer || closing) return;
  recoveryTimer = setTimeout(() => {
    recoveryTimer = undefined;
    transactionTail = transactionTail.then(async () => {
      if (closing || profileStorageHealthy) return;
      try {
        // Only retry runtime write failures, using the last successfully committed state.
        // An unreadable store at startup must never be overwritten by this recovery path.
        await persistStore(profileStore);
        profileStorageHealthy = true;
        console.info("Profile storage is writable again.");
      } catch {
        scheduleStorageRecovery();
      }
    });
  }, 10_000);
  recoveryTimer.unref();
}

/** Mutate only the supplied profile copies. Returning false skips an unchanged transaction. */
export async function profileTransaction(
  profileIds: readonly string[],
  change: (draft: ProfileStore) => void | boolean,
): Promise<void> {
  assertProfileStorage();
  if (closing || pendingWrites >= 64)
    throw new Error("Сервер занят. Попробуйте через несколько секунд");
  pendingWrites++;
  const result = transactionTail.then(async () => {
    assertProfileStorage();
    const draft: ProfileStore = {
      profiles: new Map(profileStore.profiles),
      accounts: new Map(profileStore.accounts),
      sessions: new Map(profileStore.sessions),
      rewardedMatches: new Set(profileStore.rewardedMatches),
      upgradeReceipts: new Map(profileStore.upgradeReceipts),
    };
    for (const id of new Set(profileIds)) {
      const profile = draft.profiles.get(id);
      if (profile) draft.profiles.set(id, structuredClone(profile));
    }
    // Validation errors do not mark the disk unhealthy or affect committed state.
    if (change(draft) === false) return;
    try {
      await persistStore(draft);
    } catch {
      profileStorageHealthy = false;
      console.error("Profile write failed; readiness disabled until storage recovers.");
      scheduleStorageRecovery();
      throw new Error("Не удалось сохранить профиль. Попробуйте позже");
    }
    profileStore = draft;
    profileStoreRevision++;
  });
  transactionTail = result.then(
    () => undefined,
    () => undefined,
  );
  try {
    await result;
  } finally {
    pendingWrites--;
  }
}

export async function closeProfileStorage(): Promise<void> {
  closing = true;
  clearTimeout(recoveryTimer);
  await transactionTail;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;

function isValidUpgradeAttempt(attempt: UpgradeAttempt): boolean {
  return Boolean(
    attempt &&
    getUpgradeQuote(attempt.inputs, attempt.targetItemId) &&
    typeof attempt.requestId === "string" &&
    /^[a-f0-9-]{36}$/.test(attempt.requestId) &&
    Number.isFinite(attempt.createdAt) &&
    Number.isInteger(attempt.roll) &&
    attempt.roll >= 0 &&
    attempt.roll < 10_000 &&
    Number.isInteger(attempt.chanceBasisPoints) &&
    attempt.chanceBasisPoints >= 1 &&
    attempt.chanceBasisPoints <= 9000 &&
    attempt.success === attempt.roll < attempt.chanceBasisPoints,
  );
}

export function upgradeReceiptKey(profileId: string, requestId: string): string {
  return `${profileId}:${requestId}`;
}

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
    writeAtomic(storagePath, serialize(profileStore));
    savedCurrentFormat = true;
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
      // Existing accounts predate collectible reactions. Grant only the free like.
      profile.inventory["reaction:good-move"] ??= 1;
      profile.dailyReward ??= null;
      if (
        profile.dailyReward &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(profile.dailyReward.date) ||
          !Number.isSafeInteger(profile.dailyReward.streak) ||
          profile.dailyReward.streak < 1 ||
          profile.dailyReward.coins !== profile.dailyReward.streak)
      )
        throw new Error("Invalid daily reward");
      for (const id of BASIC_ITEMS)
        if (!profile.inventory[id]) throw new Error("Missing basic item");
      for (const kind of ["avatar", "durak", "uno"] as const)
        if (!profile.inventory[`${kind}:${profile.equipped[kind]}`])
          throw new Error("Invalid equipped item");
      if (
        profile.recentOpenings.some(
          (opening) =>
            !getCosmetic(opening.itemId) ||
            (opening.caseId !== undefined && !getCase(opening.caseId)) ||
            typeof opening.requestId !== "string" ||
            !Number.isFinite(opening.openedAt),
        )
      )
        throw new Error("Invalid case history");
      profile.recentUpgrades ??= [];
      if (
        !Array.isArray(profile.recentUpgrades) ||
        profile.recentUpgrades.some((attempt) => !isValidUpgradeAttempt(attempt))
      )
        throw new Error("Invalid upgrade history");
      const key = nicknameKey(profile.nickname);
      if (nicknames.has(key) || loaded.profiles.has(profile.id))
        throw new Error("Duplicate profile");
      nicknames.add(key);
      loaded.profiles.set(profile.id, profile);
    }
    if (data.upgradeReceipts !== undefined && !Array.isArray(data.upgradeReceipts))
      throw new Error("Invalid upgrade receipts");
    for (const receipt of data.upgradeReceipts ?? []) {
      if (
        !receipt ||
        !loaded.profiles.has(receipt.profileId) ||
        !isValidUpgradeAttempt(receipt.attempt)
      )
        throw new Error("Invalid upgrade receipt");
      const key = upgradeReceiptKey(receipt.profileId, receipt.attempt.requestId);
      if (loaded.upgradeReceipts.has(key)) throw new Error("Duplicate upgrade receipt");
      loaded.upgradeReceipts.set(key, receipt);
    }
    // Migrate existing receipts without touching balances, inventory or historical values.
    for (const profile of loaded.profiles.values()) {
      for (const attempt of profile.recentUpgrades ?? []) {
        const key = upgradeReceiptKey(profile.id, attempt.requestId);
        const receipt = loaded.upgradeReceipts.get(key);
        if (receipt && !isDeepStrictEqual(receipt.attempt, attempt))
          throw new Error("Conflicting upgrade receipt");
        loaded.upgradeReceipts.set(key, receipt ?? { profileId: profile.id, attempt });
      }
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
