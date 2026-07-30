import { useMemo, useState, type FormEvent } from "react";
import { BiDonateHeart } from "react-icons/bi";
import { FaTelegramPlane, FaTwitch } from "react-icons/fa";
import { ROOM_CODE_LENGTH, sanitizeRoomCodeInput } from "../../../../shared/roomCode";
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

export function HomeScreen() {
  const { createRoom, joinRoom, joinAsSpectator, sessionPending, error } = usePlatform();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [selectedGameId, setSelectedGameId] = useState<RegisteredClientGameId | null>(null);
  const [createName, setCreateName] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [rulesGameId, setRulesGameId] = useState<RegisteredClientGameId | null>(null);

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
    setCreateName(name);
    setSelectedGameId(gameId);
  };

  const openRulesModal = (gameId: RegisteredClientGameId) => {
    setSelectedGameId(null);
    setRecoveryOpen(false);
    setRulesGameId(gameId);
  };

  const openRecoveryModal = () => {
    setSelectedGameId(null);
    setRulesGameId(null);
    setRecoveryOpen(true);
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = createName.trim();
    if (!selectedGameId || !normalizedName || sessionPending) return;
    createRoom(selectedGameId, normalizedName);
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
              Telegram
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
          <p className="platform-home-eyebrow">Игры для друзей и одного игрока</p>
          <h1 id="platform-home-title">Вечер начинается с одной комнаты</h1>
          <p className="platform-home-description">
            Выберите игру, пригласите друзей или добавьте ботов. PartyPlay объединяет комнаты,
            правила и живую игру в одном месте.
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
                    <strong>{game.metadata.title}</strong>
                    <span>{game.metadata.description}</span>
                    <small>{game.metadata.playerSummary}</small>
                  </div>
                  <div className="platform-game-actions">
                    <button
                      type="button"
                      className="platform-game-play"
                      onClick={() => openCreateModal(game.id)}
                      aria-haspopup="dialog"
                      aria-label={`Играть в ${game.metadata.title}`}
                    >
                      Играть
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
          <p>Введите имя — после создания вы сразу попадёте в лобби выбранной игры.</p>
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
