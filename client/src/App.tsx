import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PlatformOverlays } from "./platform/components/PlatformOverlays";
import { PlatformProvider, usePlatform } from "./platform/context/PlatformContext";
import { getLazyGameComponent } from "./platform/gameRegistry";
import { HomeScreen } from "./platform/screens/HomeScreen";
import { StatsScreen } from "./platform/screens/StatsScreen";
import { ProfileProvider, useProfile } from "./platform/context/ProfileContext";
import { LoginScreen, ProfileScreen } from "./platform/screens/ProfileScreen";
import { CasesScreen } from "./platform/screens/CasesScreen";
import { UpgradeScreen } from "./platform/screens/UpgradeScreen";
import { ProfileHeader } from "./platform/components/ProfileHeader";
import "./styles/profiles.css";

function ProfileApp() {
  const { profile } = useProfile();
  const [path, setPath] = useState(window.location.pathname.replace(/\/$/, "") || "/");
  useEffect(() => {
    const update = () => {
      setPath(window.location.pathname.replace(/\/$/, "") || "/");
      window.scrollTo(0, 0);
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as HTMLElement).closest("a");
      if (
        !link ||
        link.target ||
        !["/", "/login", "/profile", "/cases", "/upgrade"].includes(link.getAttribute("href") ?? "")
      )
        return;
      event.preventDefault();
      history.pushState(null, "", link.getAttribute("href"));
      update();
    };
    document.addEventListener("click", click);
    window.addEventListener("popstate", update);
    return () => {
      document.removeEventListener("click", click);
      window.removeEventListener("popstate", update);
    };
  }, []);
  const previousProfile = useRef(profile);
  useEffect(() => {
    if ((profile && path === "/login") || (previousProfile.current && !profile)) {
      history.replaceState(null, "", "/");
      setPath("/");
      window.scrollTo(0, 0);
    }
    previousProfile.current = profile;
  }, [profile, path]);
  const profilePage = path === "/profile" || path === "/cases" || path === "/upgrade";
  if (!profile && (path === "/login" || profilePage)) return <LoginScreen />;
  return (
    <>
      {profilePage && (
        <div className="show-menu platform-header">
          <div className="show-menu-shell">
            <ProfileHeader
              activePage={
                path === "/profile" ? "profile" : path === "/upgrade" ? "upgrade" : "cases"
              }
            />
          </div>
        </div>
      )}
      {path === "/profile" ? (
        <ProfileScreen />
      ) : path === "/cases" ? (
        <CasesScreen />
      ) : path === "/upgrade" ? (
        <UpgradeScreen />
      ) : (
        <RoomAppContent />
      )}
      <PlatformOverlays />
    </>
  );
}

function RoomLoading({
  message = "Загружаем комнату…",
  onCancel,
}: {
  message?: string;
  onCancel?: () => void;
}) {
  return (
    <div className="screen platform-room-loading" role="status">
      <span className="platform-loading-mark" aria-hidden="true">
        ◆
      </span>
      <p>{message}</p>
      {onCancel && (
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Вернуться на главную
        </button>
      )}
    </div>
  );
}

function RoomAppContent() {
  const { roomCode, activeGameId, snapshot, sessionPending, cancelPendingMembership, leaveRoom } =
    usePlatform();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [roomCode, snapshot?.lifecycle]);

  if (!roomCode) return <HomeScreen />;
  if (sessionPending && !snapshot) {
    return <RoomLoading message="Возвращаемся в комнату…" onCancel={cancelPendingMembership} />;
  }

  const serverGameId = snapshot?.gameId ?? activeGameId;
  if (!serverGameId) return <RoomLoading />;

  const GameModule = getLazyGameComponent(serverGameId);
  if (!GameModule) {
    return (
      <div className="screen platform-room-loading">
        <div className="platform-unsupported-game">
          <span className="platform-loading-mark" aria-hidden="true">
            ◆
          </span>
          <h1>Эта игра пока недоступна в клиенте</h1>
          <p>Комната сохранена, но интерфейс игры ещё не подключён.</p>
          <button type="button" className="btn btn-secondary" onClick={leaveRoom}>
            Вернуться на главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<RoomLoading message="Загружаем интерфейс игры…" />}>
      <GameModule />
    </Suspense>
  );
}

export default function App() {
  const statsRoute =
    window.location.pathname === "/stats" || window.location.pathname === "/stats/";

  return (
    <>
      {statsRoute ? (
        <StatsScreen />
      ) : (
        <PlatformProvider>
          <ProfileProvider>
            <ProfileApp />
          </ProfileProvider>
        </PlatformProvider>
      )}
      <div className="app-version">v{__APP_VERSION__}</div>
    </>
  );
}
