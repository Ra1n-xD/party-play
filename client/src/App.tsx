import { Suspense } from "react";
import { PlatformOverlays } from "./platform/components/PlatformOverlays";
import { PlatformProvider, usePlatform } from "./platform/context/PlatformContext";
import { getLazyGameComponent } from "./platform/gameRegistry";
import { HomeScreen } from "./platform/screens/HomeScreen";
import { StatsScreen } from "./platform/screens/StatsScreen";

function RoomLoading({ message = "Загружаем комнату…" }: { message?: string }) {
  return (
    <div className="screen platform-room-loading" role="status">
      <span className="platform-loading-mark" aria-hidden="true">
        ◆
      </span>
      <p>{message}</p>
    </div>
  );
}

function RoomAppContent() {
  const { roomCode, activeGameId, snapshot, sessionPending, leaveRoom } = usePlatform();

  if (!roomCode) return <HomeScreen />;
  if (sessionPending && !snapshot) {
    return <RoomLoading message="Возвращаемся в комнату…" />;
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
          <RoomAppContent />
          <PlatformOverlays />
        </PlatformProvider>
      )}
      <div className="app-version">v{__APP_VERSION__}</div>
    </>
  );
}
