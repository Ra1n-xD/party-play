import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BiDonateHeart } from "react-icons/bi";
import { FaTelegramPlane, FaTwitch } from "react-icons/fa";
import { ROOM_CODE_LENGTH, sanitizeRoomCodeInput } from "../../../../shared/roomCode";
import {
  PUBLIC_ROOM_SPECTATOR_LIMIT,
  type AnyPublicRoomDirectorySnapshot,
  type RoomVisibility,
} from "../../../../shared/platform/publicRooms";
import { AccessibleModal } from "../components/AccessibleModal";
import { GameRulesModal } from "../components/GameRulesModal";
import { usePlatform } from "../context/PlatformContext";
import {
  clientGameRegistry,
  type GameCatalogMetadata,
  type RegisteredClientGameId,
} from "../gameRegistry";
import { ReconnectScreen } from "./ReconnectScreen";

const CATALOG_SLOT_COUNT = 8;
type CatalogSlot = {
  id: RegisteredClientGameId;
  metadata: GameCatalogMetadata;
};

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
  const {
    connected,
    createRoom,
    joinRoom,
    joinAsSpectator,
    subscribePublicRooms,
    unsubscribePublicRooms,
    joinPublicRoom,
    watchPublicRoom,
    clearPublicRoomError,
    publicRoomCounts,
    publicRoomDirectory,
    publicRoomError,
    sessionPending,
    error,
  } = usePlatform();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [selectedGameId, setSelectedGameId] = useState<RegisteredClientGameId | null>(null);
  const [createName, setCreateName] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [rulesGameId, setRulesGameId] = useState<RegisteredClientGameId | null>(null);
  const [createVisibility, setCreateVisibility] = useState<RoomVisibility>("private");
  const [publicRoomsGameId, setPublicRoomsGameId] = useState<RegisteredClientGameId | null>(null);
  const [publicRoomName, setPublicRoomName] = useState("");
  const [directoryClock, setDirectoryClock] = useState(() => Date.now());

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

  const catalogSlots = useMemo(() => {
    const slots: Array<CatalogSlot | null> = Array.from({ length: CATALOG_SLOT_COUNT }, () => null);
    for (const game of Object.values(clientGameRegistry)) {
      slots[game.metadata.catalogSlot] = {
        id: game.id,
        metadata: game.metadata,
      };
    }
    return slots;
  }, []);
  const selectedGame = selectedGameId ? clientGameRegistry[selectedGameId] : null;
  const rulesGame = rulesGameId ? clientGameRegistry[rulesGameId] : null;
  const publicRoomsGame = publicRoomsGameId ? clientGameRegistry[publicRoomsGameId] : null;
  const selectedDirectory =
    publicRoomDirectory?.gameId === publicRoomsGameId ? publicRoomDirectory : null;
  const availableGameCount = Object.keys(clientGameRegistry).length;

  const canEnterRoom =
    name.trim().length > 0 && joinCode.length === ROOM_CODE_LENGTH && !sessionPending;

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    if (!canEnterRoom) return;
    joinRoom(joinCode, name.trim());
  };

  const handleSpectate = () => {
    if (!canEnterRoom) return;
    joinAsSpectator(joinCode, name.trim());
  };

  const openCreateModal = (gameId: RegisteredClientGameId) => {
    setRulesGameId(null);
    setRecoveryOpen(false);
    setPublicRoomsGameId(null);
    setCreateName(name);
    setCreateVisibility("private");
    setSelectedGameId(gameId);
  };

  const openRulesModal = (gameId: RegisteredClientGameId) => {
    setSelectedGameId(null);
    setRecoveryOpen(false);
    setPublicRoomsGameId(null);
    setRulesGameId(gameId);
  };

  const openRecoveryModal = () => {
    setSelectedGameId(null);
    setRulesGameId(null);
    setPublicRoomsGameId(null);
    setRecoveryOpen(true);
  };

  const openPublicRoomsModal = (gameId: RegisteredClientGameId) => {
    setSelectedGameId(null);
    setRulesGameId(null);
    setRecoveryOpen(false);
    clearPublicRoomError();
    setPublicRoomName(name);
    setPublicRoomsGameId(gameId);
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = createName.trim();
    if (!selectedGameId || !normalizedName || sessionPending) return;
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

  return (
    <main className="platform-home">
      <div className="platform-home-shell">
        <header className="platform-home-header">
          <a className="platform-home-brand" href="/" aria-label="PartyPlay — на главную">
            <span aria-hidden="true">◆</span>
            PartyPlay
          </a>
          <nav className="platform-home-socials" aria-label="Ссылки проекта">
            <a href="https://t.me/Ra1n_xD" target="_blank" rel="noopener noreferrer">
              <FaTelegramPlane aria-hidden="true" />
              Сообщить о проблеме
            </a>
            <a href="https://t.me/fronted_engineer" target="_blank" rel="noopener noreferrer">
              <FaTelegramPlane aria-hidden="true" />
              Telegram-канал
            </a>
            <a href="https://www.twitch.tv/fronted_ra1n" target="_blank" rel="noopener noreferrer">
              <FaTwitch aria-hidden="true" />
              Twitch
            </a>
          </nav>
          <a
            className="platform-home-support"
            href="https://www.donationalerts.com/r/fronted_ra1n"
            target="_blank"
            rel="noopener noreferrer"
          >
            <BiDonateHeart aria-hidden="true" />
            Поддержать проект
          </a>
        </header>

        <section className="platform-home-hero" aria-labelledby="platform-home-title">
          <p className="platform-home-eyebrow">Онлайн-игры для компании</p>
          <h1 id="platform-home-title">Соберите друзей в одной комнате</h1>
          <p className="platform-home-description">
            Выберите игру, создайте комнату и пригласите друзей.
          </p>
        </section>

        <section className="platform-home-entry" aria-labelledby="room-entry-title">
          <div className="platform-home-section-heading">
            <div>
              <h2 id="room-entry-title">Уже есть код комнаты?</h2>
              <p>Игра определится на сервере автоматически.</p>
            </div>
          </div>
          <form className="platform-home-entry-form" onSubmit={handleJoin}>
            <label className="platform-home-field">
              <span>Ваше имя</span>
              <input
                className="input"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={20}
                autoComplete="nickname"
                placeholder="Как вас зовут"
              />
            </label>
            <label className="platform-home-field">
              <span>Код комнаты</span>
              <input
                className="input input-code platform-home-code-input"
                type="text"
                value={joinCode}
                onChange={(event) => setJoinCode(sanitizeRoomCodeInput(event.target.value))}
                maxLength={ROOM_CODE_LENGTH}
                autoCapitalize="characters"
                placeholder="КОД"
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={!canEnterRoom}>
              Войти как игрок
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={handleSpectate}
              disabled={!canEnterRoom}
            >
              Наблюдать
            </button>
            <button
              type="button"
              className="btn btn-reconnect platform-home-return"
              onClick={openRecoveryModal}
              disabled={sessionPending}
            >
              Вернуться в игру
            </button>
          </form>
          {error && (
            <div className="platform-home-error" role="alert">
              {error}
            </div>
          )}
        </section>

        <section className="platform-home-catalog" aria-labelledby="game-catalog-title">
          <div className="platform-home-section-heading platform-home-catalog-heading">
            <div>
              <h2 id="game-catalog-title">Выберите игру</h2>
              <p>Новые игры будут появляться здесь</p>
            </div>
            <span>
              {availableGameCount} из 8 {availableGameCount === 1 ? "доступна" : "доступны"}
            </span>
          </div>

          <div className="platform-game-grid">
            {catalogSlots.map((game, index) =>
              game ? (
                <article className="platform-game-card is-active" key={game.id}>
                  <span className="platform-game-cover">
                    <img src={game.metadata.coverImage} alt={game.metadata.coverAlt} />
                  </span>
                  <div className="platform-game-copy">
                    <div className="platform-game-title-row">
                      <strong>{game.metadata.title}</strong>
                      <span
                        className={`platform-game-room-counts${!connected && publicRoomCounts ? " is-stale" : ""}`}
                        aria-live="polite"
                        title={
                          !connected && publicRoomCounts ? "Данные временно недоступны" : undefined
                        }
                      >
                        {publicRoomCounts ? (
                          <span>
                            Открытых комнат: <b>{publicRoomCounts.counts[game.id].publicRooms}</b>
                          </span>
                        ) : (
                          <span>Считаем комнаты…</span>
                        )}
                      </span>
                    </div>
                    <span>{game.metadata.description}</span>
                    <small>{game.metadata.playerSummary}</small>
                  </div>
                  <div className="platform-game-actions">
                    <button
                      type="button"
                      className="platform-game-play"
                      onClick={() => openCreateModal(game.id)}
                      aria-haspopup="dialog"
                      aria-label={`Создать комнату для игры ${game.metadata.title}`}
                    >
                      Создать комнату
                    </button>
                    <button
                      type="button"
                      className="platform-game-open-rooms"
                      onClick={() => openPublicRoomsModal(game.id)}
                      aria-haspopup="dialog"
                      aria-label={`Комнаты игры ${game.metadata.title}`}
                    >
                      Комнаты
                    </button>
                    <button
                      type="button"
                      className="platform-game-rules"
                      onClick={() => openRulesModal(game.id)}
                      aria-haspopup="dialog"
                      aria-label={`Правила игры ${game.metadata.title}`}
                    >
                      Правила
                    </button>
                  </div>
                </article>
              ) : (
                <article className="platform-game-card is-placeholder" key={`placeholder-${index}`}>
                  <div className="platform-game-cover" aria-hidden="true" />
                  <div className="platform-game-copy">
                    <strong>Скоро что-то будет</strong>
                  </div>
                </article>
              ),
            )}
          </div>
        </section>
      </div>

      {selectedGame && (
        <AccessibleModal
          labelledBy="create-game-room-title"
          onClose={() => setSelectedGameId(null)}
          overlayClassName="platform-create-modal"
          panelClassName="platform-create-panel"
        >
          <div className="platform-create-heading">
            <div>
              <span>{selectedGame.metadata.title}</span>
              <h2 id="create-game-room-title">Создать комнату</h2>
            </div>
            <button
              type="button"
              className="platform-modal-close"
              onClick={() => setSelectedGameId(null)}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
          <p>Введите имя и выберите, как другие игроки смогут найти комнату.</p>
          {error && (
            <div className="platform-home-error" role="alert">
              {error}
            </div>
          )}
          <form className="platform-create-form" onSubmit={handleCreate}>
            <label className="platform-home-field">
              <span>Ваше имя</span>
              <input
                className="input"
                type="text"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                maxLength={20}
                autoComplete="nickname"
                autoFocus
                placeholder="Как вас зовут"
              />
            </label>
            <fieldset className="platform-create-visibility">
              <legend>Доступ к комнате</legend>
              <div className="platform-create-visibility-options">
                <label className={createVisibility === "private" ? "is-selected" : ""}>
                  <input
                    type="radio"
                    name="room-visibility"
                    value="private"
                    checked={createVisibility === "private"}
                    onChange={() => setCreateVisibility("private")}
                  />
                  <span>
                    <strong>Закрытая по коду</strong>
                    <small>Войдут только те, кому вы отправите код</small>
                  </span>
                </label>
                <label className={createVisibility === "public" ? "is-selected" : ""}>
                  <input
                    type="radio"
                    name="room-visibility"
                    value="public"
                    checked={createVisibility === "public"}
                    onChange={() => setCreateVisibility("public")}
                  />
                  <span>
                    <strong>Открытая</strong>
                    <small>Появится в общем списке без показа кода</small>
                  </span>
                </label>
              </div>
            </fieldset>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!createName.trim() || sessionPending}
            >
              {sessionPending ? "Создаём…" : "Создать комнату"}
            </button>
          </form>
        </AccessibleModal>
      )}

      {publicRoomsGame && publicRoomsGameId && (
        <AccessibleModal
          labelledBy="public-rooms-title"
          onClose={() => setPublicRoomsGameId(null)}
          overlayClassName="platform-public-rooms-modal"
          panelClassName="platform-public-rooms-panel"
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
              <span>Ваше имя</span>
              <input
                className="input"
                type="text"
                value={publicRoomName}
                onChange={(event) => setPublicRoomName(event.target.value)}
                maxLength={20}
                autoComplete="nickname"
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
          onClose={() => setRecoveryOpen(false)}
          overlayClassName="platform-recovery-modal"
          panelClassName="platform-recovery-panel"
        >
          <ReconnectScreen onBack={() => setRecoveryOpen(false)} />
        </AccessibleModal>
      )}
    </main>
  );
}
