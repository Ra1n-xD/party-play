import { DuelsScreen } from "./platform/screens/DuelsScreen";
import { PetScreen } from "./platform/screens/PetScreen";
import { Suspense, useEffect, useRef, useState } from "react";
import { PlatformOverlays } from "./platform/components/PlatformOverlays";
import { PlatformProvider, usePlatform } from "./platform/context/PlatformContext";
import { getLazyGameComponent } from "./platform/gameRegistry";
import { HomeScreen } from "./platform/screens/HomeScreen";
import { StatsScreen } from "./platform/screens/StatsScreen";
import { ProfileProvider, useProfile } from "./platform/context/ProfileContext";
import { CollectionScreen } from "./platform/screens/CollectionScreen";
import { AccountScreen } from "./platform/screens/AccountScreen";
import { NotFoundScreen } from "./platform/screens/NotFoundScreen";
import { LoginScreen } from "./platform/screens/LoginScreen";
import { CasesScreen } from "./platform/screens/CasesScreen";
import { UpgradeScreen } from "./platform/screens/UpgradeScreen";
import { LeaderboardScreen } from "./platform/screens/LeaderboardScreen";
import { UpdatesScreen } from "./platform/screens/UpdatesScreen";
import { ProfileHeader } from "./platform/components/ProfileHeader";
import "./styles/profiles.css";
import { AppUpdateNotice } from "./platform/components/AppUpdateNotice";
import { PageMetadata } from "./platform/seo/PageMetadata";
import { PublicPage } from "./platform/seo/PublicPage";
import { publicGames } from "./platform/seo/siteMetadata";
import { RoomLoading } from "./platform/components/RoomLoading";
import { useBrowserLayoutEffect } from "./platform/useBrowserLayoutEffect";
import { finishStartup } from "./platform/startup";
import { GuestAccountScreen, isGuestAccountPath } from "./platform/screens/GuestAccountScreen";
import { loginReturnPath } from "./platform/authNavigation";
import { NavigationProvider } from "./platform/context/NavigationContext";
import "./styles/platform-navigation.css";

function readAppPath() {
  return window.location.pathname.replace(/\/$/, "") || "/";
}

function ProfileApp({ initialPath }: { initialPath: string }) {
  const { profile, loading } = useProfile();
  const { startupReady } = usePlatform();
  const [path, setPath] = useState(initialPath);
  useEffect(() => {
    if (startupReady) finishStartup();
  }, [startupReady]);
  useEffect(() => {
    const update = () => {
      setPath(readAppPath());
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
      const href = link?.getAttribute("href");
      const destination = href ? new URL(href, window.location.href) : null;
      if (
        !link ||
        link.target ||
        link.hasAttribute("download") ||
        !destination ||
        destination.origin !== window.location.origin ||
        (destination.search && destination.pathname !== "/login") ||
        destination.hash ||
        ![
          "/",
          "/login",
          "/collection",
          "/profile",
          "/cases",
          "/upgrade",
          "/updates",
          "/duels",
          "/pet",
          "/leaderboard",
          "/stats",
          ...publicGames.map((game) => `/games/${game.id}`),
        ].includes(destination.pathname)
      )
        return;
      event.preventDefault();
      history.pushState(null, "", `${destination.pathname}${destination.search}`);
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
    if (profile && path === "/login") {
      const destination = loginReturnPath(window.location.search);
      history.replaceState(null, "", destination);
      setPath(destination);
      window.scrollTo(0, 0);
    } else if (previousProfile.current && !profile && path === "/") {
      window.scrollTo(0, 0);
    }
    previousProfile.current = profile;
  }, [profile, path]);
  const profilePage = isGuestAccountPath(path);
  const gamePage = publicGames.some((game) => `/games/${game.id}` === path);
  const knownPage =
    gamePage ||
    [
      "/",
      "/login",
      "/collection",
      "/profile",
      "/cases",
      "/upgrade",
      "/leaderboard",
      "/stats",
      "/updates",
      "/duels",
      "/pet",
    ].includes(path);
  const metadata = <PageMetadata path={path} />;
  if (!profile && loading && path === "/login")
    return (
      <>
        {metadata}
        <RoomLoading message="Проверяем вход…" />
      </>
    );
  if (!profile && path === "/login")
    return (
      <>
        {metadata}
        <LoginScreen />
      </>
    );
  if (!profile && isGuestAccountPath(path))
    return (
      <>
        {metadata}
        <GuestAccountScreen path={path} />
        <PlatformOverlays />
      </>
    );
  return (
    <>
      {metadata}
      {profilePage && (
        <div className="show-menu platform-header">
          <div className="show-menu-shell">
            <ProfileHeader
              activePage={
                path === "/profile"
                  ? "account"
                  : path === "/collection"
                    ? "collection"
                    : path === "/upgrade"
                      ? "upgrade"
                      : "cases"
              }
            />
          </div>
        </div>
      )}
      {!knownPage ? (
        <NotFoundScreen />
      ) : gamePage ? (
        <PublicPage path={path} />
      ) : path === "/duels" ? (
        <DuelsScreen />
      ) : path === "/pet" ? (
        <PetScreen />
      ) : path === "/collection" ? (
        <CollectionScreen />
      ) : path === "/profile" ? (
        <AccountScreen />
      ) : path === "/cases" ? (
        <CasesScreen />
      ) : path === "/upgrade" ? (
        <UpgradeScreen />
      ) : path === "/leaderboard" ? (
        <LeaderboardScreen />
      ) : path === "/stats" ? (
        <StatsScreen />
      ) : path === "/updates" ? (
        <UpdatesScreen />
      ) : (
        <RoomAppContent />
      )}
      <PlatformOverlays />
    </>
  );
}

function RoomAppContent() {
  const {
    roomCode,
    activeGameId,
    snapshot,
    sessionPending,
    reconnectState,
    cancelPendingMembership,
    leaveRoom,
  } = usePlatform();

  useBrowserLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [roomCode, snapshot?.lifecycle]);

  if (!roomCode) return <HomeScreen />;
  if ((sessionPending || reconnectState === "reconnecting") && !snapshot) {
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

export default function App({ initialPath }: { initialPath: string }) {
  return (
    <>
      <PlatformProvider>
        <ProfileProvider>
          <NavigationProvider>
            <ProfileApp initialPath={initialPath} />
          </NavigationProvider>
        </ProfileProvider>
      </PlatformProvider>
      <div className="app-version">v{__APP_VERSION__}</div>
      <AppUpdateNotice />
    </>
  );
}
