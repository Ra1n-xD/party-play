import { brandStorage } from "../brandStorage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { socket } from "../../socket";
import { usePlatform } from "./PlatformContext";
import { AccessibleModal } from "../components/AccessibleModal";
import type {
  CaseOpening,
  ProfileSnapshot,
  ProfileReply,
} from "../../../../shared/platform/cosmetics";
import type {
  UpgradeAttempt,
  UpgradeInput,
  UpgradeRequest,
  UpgradeReply,
} from "../../../../shared/platform/upgrades";
import { getUpgradeQuote } from "../../../../shared/platform/upgrades";

import type {
  ProfileSession,
  ProfileAccountDetails,
  ProfileAccountSnapshot,
  ProfileUpdate,
} from "../../../../shared/platform/auth";
import { PROFILE_SESSION_KEY, readProfileSession, saveProfileSession } from "../profileSession";
import { getCase, type CaseId, type CaseRequest } from "../../../../shared/platform/cases";
import type { DailyReward, DailyRewardStatus } from "../../../../shared/platform/dailyRewards";
const OPENING_KEY = "partyside_pending_case_v2";
const UPGRADE_KEY = "partyside_pending_upgrade_v2";
function readPendingUpgrade(name: string): UpgradeRequest | null {
  try {
    const saved = JSON.parse(
      brandStorage.getItem(`${UPGRADE_KEY}:${name.toLocaleLowerCase("ru-RU")}`) ?? "null",
    );
    const request = saved?.request;
    return saved?.accountId === name &&
      typeof request?.requestId === "string" &&
      typeof request?.targetItemId === "string" &&
      getUpgradeQuote(request?.inputs, request?.targetItemId)
      ? request
      : null;
  } catch {
    return null;
  }
}
function pendingCase(name: string): CaseRequest | null {
  try {
    const saved = JSON.parse(brandStorage.getItem(OPENING_KEY) ?? "null");
    return saved?.accountId === name &&
      typeof saved.requestId === "string" &&
      getCase(saved.caseId ?? "partyplay")
      ? { requestId: saved.requestId, caseId: saved.caseId ?? "partyplay" }
      : null;
  } catch {
    return null;
  }
}
function savePendingCase(name: string, request: CaseRequest | null) {
  try {
    if (request) brandStorage.setItem(OPENING_KEY, JSON.stringify({ accountId: name, ...request }));
    else brandStorage.removeItem(OPENING_KEY);
  } catch {
    /* The in-memory key still prevents retry charges. */
  }
}
interface ProfileContextValue {
  profile: ProfileSnapshot | null;
  account: ProfileAccountDetails | null;
  busy: boolean;
  loading: boolean;
  connected: boolean;
  error: string | null;
  login(name: string, password: string): Promise<boolean>;
  register(name: string, password: string, email?: string): Promise<boolean>;
  updateAccount(data: ProfileUpdate): Promise<boolean>;
  logout(): void;
  equip(itemId: string): void;
  openCase(caseId: CaseId): Promise<CaseOpening | null>;
  pendingCaseId: CaseId | null;
  pendingUpgrade: UpgradeRequest | null;
  upgrade(inputs: UpgradeInput[], targetItemId: string): Promise<UpgradeAttempt | null>;
  getDailyReward(): Promise<DailyRewardStatus>;
  claimDailyReward(date: string): Promise<DailyReward | null>;
  clearError(): void;
}
const Context = createContext<ProfileContextValue | null>(null);
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { roomCode, leaveRoom } = usePlatform();
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [account, setAccount] = useState<ProfileAccountDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const accountId = useRef("");
  const pendingOpening = useRef<CaseRequest | null>(null);
  const [pendingCaseId, setPendingCaseId] = useState<CaseId | null>(null);
  const pendingUpgradeRef = useRef<UpgradeRequest | null>(null);
  const [pendingUpgrade, setPendingUpgrade] = useState<UpgradeRequest | null>(null);
  const rememberUpgrade = useCallback((request: UpgradeRequest | null) => {
    pendingUpgradeRef.current = request;
    setPendingUpgrade(request);
    try {
      const key = `${UPGRADE_KEY}:${accountId.current}`;
      if (request)
        brandStorage.setItem(key, JSON.stringify({ accountId: accountId.current, request }));
      else brandStorage.removeItem(key);
    } catch {
      /* Keep the same request in memory if browser storage is unavailable. */
    }
  }, []);
  const requestBusy = useRef(false);
  const accept = useCallback((next: ProfileSnapshot) => {
    accountId.current = next.id;
    setProfile(next);
  }, []);
  const clearProfile = useCallback(() => {
    saveProfileSession(null);
    accountId.current = "";
    pendingOpening.current = null;
    setPendingCaseId(null);
    pendingUpgradeRef.current = null;
    setPendingUpgrade(null);
    setProfile(null);
    setAccount(null);
  }, []);
  const acceptSession = useCallback(
    (next: ProfileAccountSnapshot) => {
      accept(next.profile);
      setAccount(next.account);
      pendingOpening.current = pendingCase(next.profile.id);
      setPendingCaseId(pendingOpening.current?.caseId ?? null);
      rememberUpgrade(readPendingUpgrade(next.profile.id));
    },
    [accept, rememberUpgrade],
  );
  const authenticate = useCallback(
    (
      event: "profile:login" | "profile:register",
      name: string,
      password: string,
      email?: string,
    ): Promise<boolean> => {
      if (!socket.connected || requestBusy.current) return Promise.resolve(false);
      requestBusy.current = true;
      setBusy(true);
      setError(null);
      const connectionId = socket.id;
      return new Promise((resolve) => {
        socket
          .timeout(15_000)
          .emit(
            event,
            { nickname: name, password, ...(event === "profile:register" ? { email } : {}) },
            (timeout: Error | null, result: ProfileReply<ProfileSession>) => {
              if (socket.id !== connectionId) {
                resolve(false);
                return;
              }
              requestBusy.current = false;
              setBusy(false);
              setReady(true);
              if (timeout) {
                setError(
                  "Сервер не ответил. Если аккаунт уже создан, попробуйте войти с тем же паролем",
                );
                resolve(false);
              } else if (!result.ok) {
                setError(result.error);
                resolve(false);
              } else {
                saveProfileSession(result.value.sessionToken);
                acceptSession(result.value);
                resolve(true);
              }
            },
          );
      });
    },
    [acceptSession],
  );
  const login = useCallback(
    (name: string, password: string) => authenticate("profile:login", name, password),
    [authenticate],
  );
  const register = useCallback(
    (name: string, password: string, email?: string) =>
      authenticate("profile:register", name, password, email),
    [authenticate],
  );
  const updateAccount = useCallback(
    (data: ProfileUpdate): Promise<boolean> => {
      if (!socket.connected || !ready || !accountId.current || requestBusy.current)
        return Promise.resolve(false);
      const connectionId = socket.id;
      const profileId = accountId.current;
      requestBusy.current = true;
      setBusy(true);
      setError(null);
      return new Promise((resolve) => {
        socket.timeout(15_000).emit("profile:update", data, (timeout, result) => {
          if (socket.id !== connectionId) return resolve(false);
          requestBusy.current = false;
          setBusy(false);
          if (accountId.current !== profileId) return resolve(false);
          if (timeout) {
            setError(
              "Ответ потерялся. Обновите страницу, чтобы проверить сохранение. При входе используйте новый пароль, если меняли его",
            );
            resolve(false);
          } else if (!result.ok) {
            setError(result.error);
            resolve(false);
          } else {
            accept(result.value.profile);
            setAccount(result.value.account);
            resolve(true);
          }
        });
      });
    },
    [ready, accept],
  );
  useEffect(() => {
    const acceptAccount = (next: ProfileAccountSnapshot) => {
      if (next.profile.id !== accountId.current) return;
      accept(next.profile);
      setAccount(next.account);
    };
    const connect = () => {
      setConnected(true);
      setReady(false);
      const connectionId = socket.id;
      socket
        .timeout(8000)
        .emit(
          "profile:session",
          (timeout: Error | null, result: ProfileReply<ProfileAccountSnapshot | null>) => {
            if (socket.id !== connectionId) return;
            setReady(true);
            if (timeout) {
              setError("Сервер не ответил. Обновите страницу");
              return;
            }
            if (!result.ok) {
              setError(result.error);
              return;
            }
            if (result.value) acceptSession(result.value);
            else clearProfile();
          },
        );
    };
    const disconnect = (reason: string) => {
      setConnected(false);
      setReady(false);
      requestBusy.current = false;
      setBusy(false);
      if (reason === "io server disconnect") socket.connect();
    };
    const expired = () => {
      clearProfile();
      setError(null);
    };
    const storage = (event: StorageEvent) => {
      if (
        event.key !== PROFILE_SESSION_KEY &&
        event.key !== "partyplay_profile_session_v2" &&
        event.key !== null
      )
        return;
      readProfileSession();
      socket.disconnect();
      socket.connect();
    };
    socket.on("connect", connect);
    socket.on("disconnect", disconnect);
    socket.on("profile:snapshot", accept);
    socket.on("profile:account-snapshot", acceptAccount);
    socket.on("profile:expired", expired);
    window.addEventListener("storage", storage);
    if (socket.connected) connect();
    return () => {
      socket.off("connect", connect);
      socket.off("disconnect", disconnect);
      socket.off("profile:snapshot", accept);
      socket.off("profile:account-snapshot", acceptAccount);
      socket.off("profile:expired", expired);
      window.removeEventListener("storage", storage);
    };
  }, [accept, acceptSession, clearProfile]);
  const getDailyReward = useCallback((): Promise<DailyRewardStatus> => {
    if (!socket.connected || !ready || !accountId.current)
      return Promise.reject(new Error("Нет связи. Бонус можно проверить после подключения"));
    const connectionId = socket.id;
    const profileId = accountId.current;
    return new Promise((resolve, reject) => {
      socket.timeout(8000).emit("profile:daily-status", (timeout, result) => {
        if (socket.id !== connectionId || accountId.current !== profileId || timeout)
          return reject(new Error("Не удалось проверить бонус. Попробуйте ещё раз"));
        if (!result.ok) return reject(new Error(result.error));
        resolve(result.value);
      });
    });
  }, [ready]);
  const claimDailyReward = useCallback(
    (date: string): Promise<DailyReward | null> => {
      if (!socket.connected || !ready || !accountId.current || requestBusy.current)
        return Promise.reject(new Error("Дождитесь подключения и завершения текущей операции"));
      const connectionId = socket.id;
      const profileId = accountId.current;
      requestBusy.current = true;
      setBusy(true);
      return new Promise((resolve, reject) => {
        socket.timeout(8000).emit("profile:claim-daily", { date }, (timeout, result) => {
          if (socket.id !== connectionId)
            return reject(new Error("Соединение изменилось. Откройте бонус снова"));
          requestBusy.current = false;
          setBusy(false);
          if (accountId.current !== profileId)
            return reject(new Error("Аккаунт изменился. Откройте бонус снова"));
          if (timeout)
            return reject(
              new Error("Ответ потерялся. Повторите запрос: второй раз бонус не начислится"),
            );
          if (!result.ok) return reject(new Error(result.error));
          accept(result.value.profile);
          resolve(result.value.reward);
        });
      });
    },
    [ready, accept],
  );
  const performLogout = () => {
    if (!socket.connected || !ready || requestBusy.current) return;
    requestBusy.current = true;
    setConfirmLogout(false);
    setBusy(true);
    setError(null);
    const connectionId = socket.id;
    // Socket.IO preserves packet order: leave membership before logging out.
    if (roomCode) leaveRoom();
    socket
      .timeout(8000)
      .emit("profile:logout", (timeout: Error | null, result: ProfileReply<null>) => {
        requestBusy.current = false;
        setBusy(false);
        if (socket.id !== connectionId) return;
        if (timeout) setError("Сервер не ответил");
        else if (!result.ok) setError(result.error);
        else {
          clearProfile();
        }
      });
  };
  const logout = () => {
    if (!socket.connected || !ready || requestBusy.current) return;
    setConfirmLogout(true);
  };
  const equip = (itemId: string) => {
    if (!socket.connected || requestBusy.current) return;
    const connectionId = socket.id;
    requestBusy.current = true;
    setBusy(true);
    setError(null);
    socket
      .timeout(8000)
      .emit(
        "profile:equip",
        { itemId },
        (timeout: Error | null, result: ProfileReply<ProfileSnapshot>) => {
          if (socket.id !== connectionId) return;
          requestBusy.current = false;
          setBusy(false);
          if (timeout) setError("Сервер не ответил. Обновите профиль перед повторной попыткой");
          else if (!result.ok) setError(result.error);
          else accept(result.value);
        },
      );
  };
  const openCase = (caseId: CaseId): Promise<CaseOpening | null> => {
    if (!socket.connected || requestBusy.current) return Promise.resolve(null);
    const connectionId = socket.id;
    requestBusy.current = true;
    setBusy(true);
    setError(null);
    const request = pendingOpening.current ?? { requestId: crypto.randomUUID(), caseId };
    pendingOpening.current = request;
    setPendingCaseId(request.caseId);
    savePendingCase(accountId.current, request);
    return new Promise((resolve) =>
      socket
        .timeout(8000)
        .emit(
          "profile:open-case",
          request,
          (
            timeout: Error | null,
            result: ProfileReply<{ profile: ProfileSnapshot; opening: CaseOpening }>,
          ) => {
            if (socket.id !== connectionId) {
              resolve(null);
              return;
            }
            requestBusy.current = false;
            setBusy(false);
            if (timeout) {
              setError("Ответ потерялся. Повторите запрос: повторного списания не будет");
              resolve(null);
            } else if (!result.ok) {
              pendingOpening.current = null;
              setPendingCaseId(null);
              savePendingCase(accountId.current, null);
              setError(result.error);
              resolve(null);
            } else {
              pendingOpening.current = null;
              setPendingCaseId(null);
              savePendingCase(accountId.current, null);
              accept(result.value.profile);
              resolve(result.value.opening);
            }
          },
        ),
    );
  };
  const upgrade = (
    inputs: UpgradeInput[],
    targetItemId: string,
  ): Promise<UpgradeAttempt | null> => {
    if (!socket.connected || !ready || requestBusy.current) return Promise.resolve(null);
    const connectionId = socket.id;
    requestBusy.current = true;
    setBusy(true);
    setError(null);
    const request = pendingUpgradeRef.current ?? {
      requestId: crypto.randomUUID(),
      inputs,
      targetItemId,
    };
    rememberUpgrade(request);
    return new Promise((resolve) =>
      socket
        .timeout(8000)
        .emit("profile:upgrade", request, (timeout: Error | null, result: UpgradeReply) => {
          if (socket.id !== connectionId) {
            resolve(null);
            return;
          }
          requestBusy.current = false;
          setBusy(false);
          if (timeout) {
            setError("Ответ потерялся. Восстановите результат: повторного списания не будет");
            resolve(null);
          } else if (!result.ok) {
            // A temporary failure says nothing about whether an earlier request committed.
            // Keep its ID until the server returns a receipt or a definitive rejection.
            if (result.retryable === false) rememberUpgrade(null);
            setError(result.error);
            resolve(null);
          } else {
            rememberUpgrade(null);
            accept(result.value.profile);
            resolve(result.value.attempt);
          }
        }),
    );
  };
  return (
    <Context.Provider
      value={{
        profile,
        account,
        busy,
        loading: !ready,
        connected: connected && ready,
        error,
        login,
        register,
        updateAccount,
        logout,
        equip,
        openCase,
        pendingCaseId,
        pendingUpgrade,
        upgrade,
        getDailyReward,
        claimDailyReward,
        clearError: () => setError(null),
      }}
    >
      {children}
      {confirmLogout && profile && (
        <AccessibleModal
          labelledBy="profile-logout-title"
          onClose={() => setConfirmLogout(false)}
          panelClassName="profile-logout-dialog"
        >
          <h2 id="profile-logout-title">Выйти из аккаунта?</h2>
          <p className="profile-logout-note">
            {roomCode &&
              "Вы также покинете текущую комнату. Если в ней больше нет людей, она закроется. "}
            Ваши монеты и коллекция сохранятся. Чтобы вернуться в аккаунт, понадобится пароль.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmLogout(false)}>
              Остаться
            </button>
            <button
              className="btn btn-primary"
              onClick={performLogout}
              disabled={busy || !connected}
            >
              Выйти из аккаунта
            </button>
          </div>
        </AccessibleModal>
      )}
    </Context.Provider>
  );
}
export function useProfile() {
  const value = useContext(Context);
  if (!value) throw new Error("ProfileProvider is missing");
  return value;
}
