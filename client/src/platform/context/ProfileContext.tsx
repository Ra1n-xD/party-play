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
} from "../../../../shared/platform/upgrades";
import { getUpgradeQuote } from "../../../../shared/platform/upgrades";

const STORAGE_KEY = "partyplay_nickname_v1";
const OPENING_KEY = "partyplay_pending_case_v1";
const UPGRADE_KEY = "partyplay_pending_upgrade_v1";
function readPendingUpgrade(name: string): UpgradeRequest | null {
  try {
    const saved = JSON.parse(
      localStorage.getItem(`${UPGRADE_KEY}:${name.toLocaleLowerCase("ru-RU")}`) ?? "null",
    );
    const request = saved?.request;
    return saved?.nickname === name &&
      typeof request?.requestId === "string" &&
      typeof request?.targetItemId === "string" &&
      getUpgradeQuote(request?.inputs, request?.targetItemId)
      ? request
      : null;
  } catch {
    return null;
  }
}
function pendingCase(name: string): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(OPENING_KEY) ?? "null");
    return saved?.nickname === name ? saved.requestId : null;
  } catch {
    return null;
  }
}
function savePendingCase(name: string, requestId: string | null) {
  try {
    if (requestId) localStorage.setItem(OPENING_KEY, JSON.stringify({ nickname: name, requestId }));
    else localStorage.removeItem(OPENING_KEY);
  } catch {
    /* The in-memory key still prevents retry charges. */
  }
}
function savedNickname() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
function saveNickname(name: string) {
  try {
    if (name) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Login still works without browser storage. */
  }
}
interface ProfileContextValue {
  profile: ProfileSnapshot | null;
  busy: boolean;
  connected: boolean;
  error: string | null;
  login(name: string): void;
  logout(): void;
  equip(itemId: string): void;
  openCase(): Promise<CaseOpening | null>;
  pendingUpgrade: UpgradeRequest | null;
  upgrade(inputs: UpgradeInput[], targetItemId: string): Promise<UpgradeAttempt | null>;
  clearError(): void;
}
const Context = createContext<ProfileContextValue | null>(null);
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { roomCode, leaveRoom } = usePlatform();
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const nickname = useRef(savedNickname());
  const pendingOpening = useRef<string | null>(null);
  const pendingUpgradeRef = useRef<UpgradeRequest | null>(null);
  const [pendingUpgrade, setPendingUpgrade] = useState<UpgradeRequest | null>(null);
  const rememberUpgrade = useCallback((request: UpgradeRequest | null) => {
    pendingUpgradeRef.current = request;
    setPendingUpgrade(request);
    try {
      const key = `${UPGRADE_KEY}:${nickname.current.toLocaleLowerCase("ru-RU")}`;
      if (request)
        localStorage.setItem(key, JSON.stringify({ nickname: nickname.current, request }));
      else localStorage.removeItem(key);
    } catch {
      /* Keep the same request in memory if browser storage is unavailable. */
    }
  }, []);
  const requestBusy = useRef(false);
  const accept = useCallback((next: ProfileSnapshot) => {
    nickname.current = next.nickname;
    saveNickname(next.nickname);
    setProfile(next);
  }, []);
  const login = useCallback(
    (name: string) => {
      if (!socket.connected || requestBusy.current) return;
      requestBusy.current = true;
      setBusy(true);
      setError(null);
      const connectionId = socket.id;
      socket
        .timeout(8000)
        .emit(
          "profile:login",
          { nickname: name },
          (timeout: Error | null, result: ProfileReply<ProfileSnapshot>) => {
            requestBusy.current = false;
            setBusy(false);
            if (socket.id !== connectionId) return;
            setReady(true);
            if (timeout) {
              setProfile(null);
              setError("Сервер не ответил. Попробуйте войти ещё раз");
            } else if (!result.ok) {
              setProfile(null);
              setError(result.error);
            } else {
              accept(result.value);
              pendingOpening.current = pendingCase(result.value.nickname);
              rememberUpgrade(readPendingUpgrade(result.value.nickname));
            }
          },
        );
    },
    [accept, rememberUpgrade],
  );
  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      if (!socket.connected) return;
      if (requestBusy.current) {
        retry = setTimeout(restore, 150);
        return;
      }
      if (nickname.current) login(nickname.current);
      else setReady(true);
    };
    const connect = () => {
      setConnected(true);
      setReady(false);
      clearTimeout(retry);
      restore();
    };
    const disconnect = () => {
      setConnected(false);
      setReady(false);
    };
    socket.on("connect", connect);
    socket.on("disconnect", disconnect);
    socket.on("profile:snapshot", accept);
    if (socket.connected) connect();
    return () => {
      clearTimeout(retry);
      socket.off("connect", connect);
      socket.off("disconnect", disconnect);
      socket.off("profile:snapshot", accept);
    };
  }, [accept, login]);
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
          nickname.current = "";
          saveNickname("");
          pendingOpening.current = null;
          pendingUpgradeRef.current = null;
          setPendingUpgrade(null);
          setProfile(null);
        }
      });
  };
  const logout = () => {
    if (!socket.connected || !ready || requestBusy.current) return;
    if (roomCode) setConfirmLogout(true);
    else performLogout();
  };
  const equip = (itemId: string) => {
    if (!socket.connected || requestBusy.current) return;
    requestBusy.current = true;
    setBusy(true);
    setError(null);
    socket
      .timeout(8000)
      .emit(
        "profile:equip",
        { itemId },
        (timeout: Error | null, result: ProfileReply<ProfileSnapshot>) => {
          requestBusy.current = false;
          setBusy(false);
          if (timeout) setError("Сервер не ответил. Обновите профиль перед повторной попыткой");
          else if (!result.ok) setError(result.error);
          else accept(result.value);
        },
      );
  };
  const openCase = (): Promise<CaseOpening | null> => {
    if (!socket.connected || requestBusy.current) return Promise.resolve(null);
    requestBusy.current = true;
    setBusy(true);
    setError(null);
    const requestId = pendingOpening.current ?? crypto.randomUUID();
    pendingOpening.current = requestId;
    savePendingCase(nickname.current, requestId);
    return new Promise((resolve) =>
      socket
        .timeout(8000)
        .emit(
          "profile:open-case",
          { requestId },
          (
            timeout: Error | null,
            result: ProfileReply<{ profile: ProfileSnapshot; opening: CaseOpening }>,
          ) => {
            requestBusy.current = false;
            setBusy(false);
            if (timeout) {
              setError("Ответ потерялся. Повторите запрос: повторного списания не будет");
              resolve(null);
            } else if (!result.ok) {
              pendingOpening.current = null;
              savePendingCase(nickname.current, null);
              setError(result.error);
              resolve(null);
            } else {
              pendingOpening.current = null;
              savePendingCase(nickname.current, null);
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
        .emit(
          "profile:upgrade",
          request,
          (
            timeout: Error | null,
            result: ProfileReply<{ profile: ProfileSnapshot; attempt: UpgradeAttempt }>,
          ) => {
            requestBusy.current = false;
            setBusy(false);
            if (timeout) {
              setError("Ответ потерялся. Восстановите результат: повторного списания не будет");
              resolve(null);
            } else if (!result.ok) {
              rememberUpgrade(null);
              setError(result.error);
              resolve(null);
            } else {
              rememberUpgrade(null);
              accept(result.value.profile);
              resolve(result.value.attempt);
            }
          },
        ),
    );
  };
  return (
    <Context.Provider
      value={{
        profile,
        busy,
        connected: connected && ready,
        error,
        login,
        logout,
        equip,
        openCase,
        pendingUpgrade,
        upgrade,
        clearError: () => setError(null),
      }}
    >
      {children}
      {confirmLogout && profile && (
        <AccessibleModal labelledBy="profile-logout-title" onClose={() => setConfirmLogout(false)}>
          <h2 id="profile-logout-title">Выйти из аккаунта?</h2>
          <p className="profile-logout-note">
            Вы также покинете текущую комнату. Если в ней больше нет людей, она закроется. Коллекция
            сохранится за вашим ником.
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
