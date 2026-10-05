import { useEffect, useRef, useState, type FormEvent } from "react";
import { FiBookOpen, FiUsers } from "react-icons/fi";
import { ROOM_CODE_LENGTH } from "../../../../shared/roomCode";
import {
  PUBLIC_ROOM_SPECTATOR_LIMIT,
  type AnyPublicRoomDirectorySnapshot,
  type RoomVisibility,
} from "../../../../shared/platform/publicRooms";
import { AccessibleModal } from "../components/AccessibleModal";
import { ProfileHeader } from "../components/ProfileHeader";
import { MenuFooter } from "../components/MenuFooter";
import { GameMenuArtwork } from "../components/GameMenuArtwork";
import { GameCatalog } from "../components/GameCatalog";
import { GameRulesModal } from "../components/GameRulesModal";
import { RoomEntryForm, type RoomEntryMode } from "../components/RoomEntryForm";
import { usePlatform } from "../context/PlatformContext";
import { useProfile } from "../context/ProfileContext";
import { clientGameRegistry, type RegisteredClientGameId } from "../gameRegistry";
import { gameMenuPresentation } from "../gameMenuPresentation";
import { ReconnectScreen } from "./ReconnectScreen";
import { HomeAbout } from "../seo/PublicPage";
import "../../styles/show-menu.css";
import "../../styles/game-catalog.css";

const catalogGames = Object.values(clientGameRegistry).sort(
  (a, b) => a.metadata.catalogSlot - b.metadata.catalogSlot,
);
type PublicRoomListItem = AnyPublicRoomDirectorySnapshot["rooms"][number];

function roomStatus(room: PublicRoomListItem): string {
  if (room.lifecycle === "lobby") return "Ожидание";
  if (room.lifecycle === "results") return "Результат";
  return room.paused ? "Пауза" : "Игра идёт";
}

function roomAge(createdAt: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - createdAt) / 60_000));
  if (minutes < 1) return "меньше минуты";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

function roomTimerSetting(room: PublicRoomListItem): string | null {
  if (!room.settings || !("turnTimeoutSeconds" in room.settings)) return null;
  return room.settings.turnTimeoutSeconds
    ? `Ход: ${room.settings.turnTimeoutSeconds} сек`
    : "Ход без таймера";
}

export function HomeScreen() {
  const { profile } = useProfile();
  const {
    connected,
    createRoom,
    joinRoom,
    joinAsSpectator,
    clearError,
    subscribePublicRooms,
    unsubscribePublicRooms,
    joinPublicRoom,
    watchPublicRoom,
    clearPublicRoomError,
    resetSeatRecovery,
    publicRoomCounts,
    publicRoomDirectory,
    publicRoomError,
    pendingSeatClaim,
    sessionPending,
    error,
  } = usePlatform();
  const [name, setName] = useState(profile?.nickname ?? "");
  useEffect(() => {
    setName(profile?.nickname ?? "");
    setPublicRoomName(profile?.nickname ?? "");
  }, [profile?.nickname]);
  const [joinCode, setJoinCode] = useState("");
  const [selectedGameId, setSelectedGameId] = useState<RegisteredClientGameId | null>(() => {
    const requested = new URLSearchParams(window.location.search).get("game");
    return requested && Object.hasOwn(clientGameRegistry, requested)
      ? (requested as RegisteredClientGameId)
      : null;
  });
  const [entryMode, setEntryMode] = useState<RoomEntryMode>("join");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [rulesGameId, setRulesGameId] = useState<RegisteredClientGameId | null>(null);
  const [createVisibility, setCreateVisibility] = useState<RoomVisibility>("private");
  const [publicRoomsGameId, setPublicRoomsGameId] = useState<RegisteredClientGameId | null>(null);
  const [publicRoomName, setPublicRoomName] = useState(profile?.nickname ?? "");
  const [directoryClock, setDirectoryClock] = useState(() => Date.now());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const initialRender = useRef(true);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [selectedGameId]);

  useEffect(() => {
    if (!publicRoomsGameId) return;
    subscribePublicRooms(publicRoomsGameId);
    return () => unsubscribePublicRooms(publicRoomsGameId);
  }, [publicRoomsGameId, subscribePublicRooms, unsubscribePublicRooms]);

  useEffect(() => {
    if (!publicRoomsGameId) return;
    setDirectoryClock(Date.now());
    const timer = window.setInterval(() => setDirectoryClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [publicRoomsGameId]);

  const selectedGame = selectedGameId ? clientGameRegistry[selectedGameId] : null;
  const currentGame = selectedGame ?? catalogGames[0];
  const presentation = gameMenuPresentation[currentGame.id];
  const rulesGame = rulesGameId ? clientGameRegistry[rulesGameId] : null;
  const publicRoomsGame = publicRoomsGameId ? clientGameRegistry[publicRoomsGameId] : null;
  const selectedDirectory =
    publicRoomDirectory?.gameId === publicRoomsGameId ? publicRoomDirectory : null;
  const recoveryTransitionLocked =
    pendingSeatClaim !== null &&
    ["submitting", "waiting", "cancelling", "approved"].includes(pendingSeatClaim.status);
  const canEnterRoom =
    connected && !!name.trim() && joinCode.length === ROOM_CODE_LENGTH && !sessionPending;

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    if (canEnterRoom) joinRoom(joinCode, name.trim());
  };
  const handleSpectate = () => {
    if (canEnterRoom) joinAsSpectator(joinCode, name.trim());
  };
  const openGame = (gameId: RegisteredClientGameId) => {
    clearError();
    setSelectedGameId(gameId);
    history.replaceState(null, "", `/?game=${gameId}`);
    setEntryMode("join");
    setCreateVisibility("private");
  };
  const backToCatalog = () => {
    clearError();
    setSelectedGameId(null);
    history.replaceState(null, "", "/");
  };
  const openRulesModal = (gameId: RegisteredClientGameId) => {
    setRecoveryOpen(false);
    setPublicRoomsGameId(null);
    setRulesGameId(gameId);
  };
  const openRecoveryModal = () => {
    setRulesGameId(null);
    setPublicRoomsGameId(null);
    setRecoveryOpen(true);
  };
  const closeRecoveryModal = () => {
    if (recoveryTransitionLocked) return;
    resetSeatRecovery();
    setRecoveryOpen(false);
  };
  const openPublicRoomsModal = (gameId: RegisteredClientGameId) => {
    setRulesGameId(null);
    setRecoveryOpen(false);
    clearPublicRoomError();
    setPublicRoomName(name);
    setPublicRoomsGameId(gameId);
  };
  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!selectedGameId || !normalizedName || sessionPending || !connected) return;
    setName(normalizedName);
    createRoom(selectedGameId, normalizedName, createVisibility);
  };
  const enterPublicRoom = (room: PublicRoomListItem) => {
    const normalizedName = publicRoomName.trim();
    if (!publicRoomsGameId || !normalizedName || sessionPending || !connected) return;
    setName(normalizedName);
    if (room.lifecycle === "lobby" && room.playerCount < room.seatLimit) {
      joinPublicRoom(publicRoomsGameId, room.publicRoomId, normalizedName);
    } else {
      watchPublicRoom(publicRoomsGameId, room.publicRoomId, normalizedName);
    }
  };

  const entryForm = (
    <RoomEntryForm
      compact={!selectedGame}
      mode={selectedGame ? entryMode : "join"}
      name={name}
      nameReadOnly={Boolean(profile)}
      code={joinCode}
      connected={connected}
      pending={sessionPending}
      error={error}
      visibility={createVisibility}
      onNameChange={(value) => {
        setName(value);
        if (error) clearError();
      }}
      onCodeChange={(value) => {
        setJoinCode(value);
        if (error) clearError();
      }}
      onVisibilityChange={setCreateVisibility}
      onSubmit={selectedGame && entryMode === "create" ? handleCreate : handleJoin}
      onSpectate={handleSpectate}
      onReconnect={openRecoveryModal}
      onModeChange={
        selectedGame
          ? (mode) => {
              clearError();
              setEntryMode(mode);
            }
          : undefined
      }
    />
  );
  const roomCount = publicRoomCounts?.counts[currentGame.id].publicRooms;
  const publicRoomsButton = (
    <button
      className="show-quiet"
      type="button"
      onClick={() => openPublicRoomsModal(currentGame.id)}
      aria-haspopup="dialog"
    >
      <FiUsers aria-hidden="true" /> Открытые комнаты
      {connected && roomCount !== undefined && <span className="show-room-count">{roomCount}</span>}
    </button>
  );
  const rulesButton = (
    <button
      className="show-quiet"
      type="button"
      onClick={() => openRulesModal(currentGame.id)}
      aria-haspopup="dialog"
    >
      <FiBookOpen aria-hidden="true" /> Правила игры
    </button>
  );

  const screen = (
    <main
      className={`show-menu${selectedGame ? " is-game-menu" : " is-main-menu"}`}
      data-game={selectedGame?.id}
    >
      <div className="show-menu-ambience" aria-hidden="true" />
      <div className="show-menu-shell">
        <ProfileHeader onHome={selectedGame ? backToCatalog : undefined} />
        {selectedGame && (
          <div className="show-game-navigation">
            <nav className="show-game-switch" aria-label="Выберите игру">
              {catalogGames.map((game) => (
                <button
                  type="button"
                  key={game.id}
                  aria-pressed={selectedGameId === game.id}
                  onClick={() => openGame(game.id)}
                >
                  {game.metadata.title}
                </button>
              ))}
            </nav>
          </div>
        )}

        {selectedGame ? (
          <>
            <section className="show-game-title" aria-labelledby="show-menu-title">
              <p className="show-kicker">{presentation.kicker}</p>
              <h1 id="show-menu-title" ref={titleRef} tabIndex={-1}>
                {selectedGame.metadata.title}
              </h1>
              <p>{presentation.tagline}</p>
            </section>
            <div className="show-stage">
              <div className="show-stage-art">
                <GameMenuArtwork gameId={selectedGame.id} />
              </div>
              {entryForm}
              <aside className="show-stage-aside" aria-label="Об игре">
                <p className="show-bubble">
                  {presentation.punchline.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </p>
                <p className="show-player-summary">
                  <FiUsers aria-hidden="true" />
                  {selectedGame.metadata.playerSummary}
                </p>
                {rulesButton}
                {publicRoomsButton}
              </aside>
            </div>
          </>
        ) : (
          <>
            <section className="show-headline" aria-labelledby="show-menu-title">
              <h1 id="show-menu-title" ref={titleRef} tabIndex={-1}>
                ВЕЧЕР НАЧИНАЕТСЯ.
              </h1>
              <div className="show-headline-tools">
                <span className="show-tag">Ваша компания. Ваше шоу.</span>
                <a className="show-mobile-join" href="#show-room-entry">
                  Есть код? Войти ↓
                </a>
              </div>
            </section>
            <div className="show-catalog-layout">
              <GameCatalog
                games={catalogGames}
                counts={connected ? publicRoomCounts?.counts : undefined}
                onPlay={openGame}
                onRooms={openPublicRoomsModal}
                onRules={openRulesModal}
              />
              <aside className="show-catalog-entry" aria-label="Вход в игру и первые шаги">
                {entryForm}
                <ol className="show-catalog-steps" aria-label="Как начать">
                  <li>
                    <span aria-hidden="true">01</span> Выберите игру
                  </li>
                  <li>
                    <span aria-hidden="true">02</span> Поделитесь кодом
                  </li>
                  <li>
                    <span aria-hidden="true">03</span> Играйте вместе
                  </li>
                </ol>
              </aside>
            </div>
          </>
        )}

        <MenuFooter />
      </div>

      {publicRoomsGame && publicRoomsGameId && (
        <AccessibleModal
          labelledBy="public-rooms-title"
          onClose={() => setPublicRoomsGameId(null)}
          overlayClassName="platform-public-rooms-modal"
          panelClassName="platform-public-rooms-panel party-dialog"
        >
          <div className="platform-create-heading platform-public-rooms-heading">
            <div>
              <span>{publicRoomsGame.metadata.title}</span>
              <h2 id="public-rooms-title">Открытые комнаты</h2>
            </div>
            <button
              type="button"
              className="platform-modal-close"
              onClick={() => setPublicRoomsGameId(null)}
              aria-label="Закрыть список открытых комнат"
            >
              ×
            </button>
          </div>

          <div className="platform-public-rooms-intro">
            <label className="platform-home-field">
              <span>Ваш никнейм</span>
              <input
                className="input"
                type="text"
                value={publicRoomName}
                onChange={(event) => setPublicRoomName(event.target.value)}
                maxLength={20}
                autoComplete="nickname"
                readOnly={Boolean(profile)}
                placeholder="Как вас зовут"
              />
            </label>
            <div
              className={`platform-public-connection${connected ? " is-online" : " is-offline"}`}
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true" />
              {connected ? "Список обновляется автоматически" : "Соединение потеряно"}
            </div>
          </div>

          <p className="platform-public-rooms-note">
            Выберите свободное лобби или подключитесь зрителем к уже начавшейся партии.
          </p>

          {!connected && selectedDirectory && (
            <div className="platform-public-state is-stale" role="status">
              Показаны последние полученные данные. Действия временно недоступны.
            </div>
          )}

          {publicRoomError &&
            (!publicRoomError.gameId || publicRoomError.gameId === publicRoomsGameId) && (
              <div className="platform-public-state is-error" role="alert">
                <span>{publicRoomError.message}</span>
                <button
                  type="button"
                  onClick={() => subscribePublicRooms(publicRoomsGameId)}
                  disabled={!connected}
                >
                  Повторить загрузку
                </button>
              </div>
            )}

          {!selectedDirectory ? (
            <div className="platform-public-state" role="status" aria-live="polite">
              {connected ? "Загружаем открытые комнаты…" : "Данные временно недоступны"}
            </div>
          ) : selectedDirectory.rooms.length === 0 ? (
            <div className="platform-public-state" role="status">
              <strong>Открытых комнат пока нет</strong>
              <span>Создайте первую или попробуйте обновить список позже.</span>
            </div>
          ) : (
            <ul className="platform-public-room-list" aria-label="Доступные открытые комнаты">
              {selectedDirectory.rooms.map((room) => {
                const canJoin = room.lifecycle === "lobby" && room.playerCount < room.seatLimit;
                const spectatorLimitReached =
                  !canJoin && room.spectatorCount >= PUBLIC_ROOM_SPECTATOR_LIMIT;
                const timerSetting = roomTimerSetting(room);
                const actionLabel = canJoin
                  ? "Войти"
                  : spectatorLimitReached
                    ? "Лимит зрителей"
                    : "Наблюдать";

                return (
                  <li className="platform-public-room" key={room.publicRoomId}>
                    <div className="platform-public-room-main">
                      <span
                        className={`platform-public-room-status is-${room.lifecycle}${room.paused ? " is-paused" : ""}`}
                      >
                        {roomStatus(room)}
                      </span>
                      <strong>
                        {room.playerCount} из {room.seatLimit} мест
                      </strong>
                      <small>Создана {roomAge(room.createdAt, directoryClock)} назад</small>
                    </div>
                    <div className="platform-public-room-meta">
                      <span>Зрителей: {room.spectatorCount}</span>
                      {timerSetting && <span>{timerSetting}</span>}
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary platform-public-room-action"
                      onClick={() => enterPublicRoom(room)}
                      disabled={
                        !connected ||
                        !publicRoomName.trim() ||
                        sessionPending ||
                        spectatorLimitReached
                      }
                      aria-label={`${actionLabel}: ${roomStatus(room)}, ${room.playerCount} из ${room.seatLimit} мест`}
                    >
                      {sessionPending ? "Подключаем…" : actionLabel}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </AccessibleModal>
      )}

      {rulesGame && (
        <GameRulesModal
          gameId={rulesGame.id}
          gameTitle={rulesGame.metadata.title}
          rules={rulesGame.rules}
          onClose={() => setRulesGameId(null)}
        />
      )}

      {recoveryOpen && (
        <AccessibleModal
          labelledBy="seat-recovery-title"
          onClose={closeRecoveryModal}
          overlayClassName="platform-recovery-modal"
          panelClassName="platform-recovery-panel party-dialog"
        >
          <ReconnectScreen onBack={() => setRecoveryOpen(false)} />
        </AccessibleModal>
      )}
    </main>
  );
  return (
    <>
      {screen}
      {!selectedGame && <HomeAbout />}
    </>
  );
}
