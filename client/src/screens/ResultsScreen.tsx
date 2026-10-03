import { FiCheckCircle, FiLogOut, FiShield } from "react-icons/fi";
import { useGame } from "../context/GameContext";
import { BunkerAttributeIcon } from "../games/bunker/BunkerAttributeIcon";
import { usePlatform } from "../platform/context/PlatformContext";
import { AvatarPortrait } from "../platform/components/AvatarPortrait";
import { GameRoomHeader } from "./game/GameRoomHeader";
import { GameDockTools } from "./game/GameDockTools";
import "../games/bunker/bunker-results.css";

export function ResultsScreen() {
  const { snapshot } = usePlatform();
  const {
    connected,
    commandPending,
    reconnectState,
    roomCode,
    gameState,
    playerId,
    isSpectator,
    playAgain,
    leaveRoom,
  } = useGame();
  if (!gameState) return null;

  const me = isSpectator ? undefined : gameState.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const survivors = gameState.players.filter((p) => p.alive && !p.kicked);
  const eliminated = gameState.players.filter((p) => !p.alive && !p.kicked);
  const kicked = gameState.players.filter((p) => p.kicked);

  const renderPlayerCard = (player: (typeof gameState.players)[0]) => {
    const attributes =
      player.allAttributes || player.revealedAttributes.map((a) => ({ ...a, wasRevealed: true }));
    const isMe = !isSpectator && player.id === playerId;
    return (
      <article key={player.id} className={`bunker-result-player${isMe ? " is-me" : ""}`}>
        <header>
          <AvatarPortrait
            avatarId={
              snapshot?.seats.find((seat) => seat.seatId === player.id)?.avatarId ?? "human"
            }
          />
          <h3>{player.name}</h3>
          {isMe && <span className="bunker-result-badge">Вы</span>}
          {player.isBot && <span className="bunker-result-badge">Бот</span>}
        </header>
        <div className="bunker-result-attributes">
          {attributes.map((attribute) => (
            <div className="bunker-result-attribute" key={attribute.type}>
              <span className="bunker-result-label">
                <BunkerAttributeIcon type={attribute.type} /> {attribute.label}
              </span>
              <strong>{attribute.value}</strong>
              {attribute.detail && <p>{attribute.detail}</p>}
              {!attribute.wasRevealed && <small>Не раскрывалось в игре</small>}
            </div>
          ))}
          {player.actionCard && (
            <div className="bunker-result-attribute is-action">
              <span className="bunker-result-label">
                <BunkerAttributeIcon type="action" /> Особое условие
              </span>
              <strong>{player.actionCard.title}</strong>
              <p>{player.actionCard.description}</p>
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <main className="screen command-game-screen bunker-results has-results-command-bar">
      <GameRoomHeader roomCode={roomCode} connected={connected} onLeaveRoom={leaveRoom} />
      <div className="bunker-results-content">
        <header className="bunker-results-hero">
          <span className="bunker-results-eyebrow">Бункер / Итоги партии</span>
          <h1>
            {isSpectator ? "Совет сделал выбор" : me?.alive ? "Вы в бункере!" : "Вы за порогом…"}
          </h1>
          {gameState.catastrophe && <p>{gameState.catastrophe.title}</p>}
          <span className="bunker-results-count">
            <FiShield aria-hidden="true" /> В убежище: {survivors.length}
          </span>
        </header>

        {(gameState.revealedBunkerCards.length > 0 || gameState.threatCard) && (
          <section className="bunker-results-scenario" aria-label="Условия выживания">
            {gameState.revealedBunkerCards.map((card, index) => (
              <article key={index}>
                <span className="bunker-results-eyebrow">Карта бункера</span>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
              </article>
            ))}
            {gameState.threatCard && (
              <article className="is-threat">
                <span className="bunker-results-eyebrow">Угроза</span>
                <h2>{gameState.threatCard.title}</h2>
                <p>{gameState.threatCard.description}</p>
              </article>
            )}
          </section>
        )}

        <section className="bunker-results-group" aria-labelledby="bunker-survivors-title">
          <h2 id="bunker-survivors-title">
            <FiCheckCircle aria-hidden="true" /> В бункере <span>{survivors.length}</span>
          </h2>
          <div className="bunker-results-players">{survivors.map(renderPlayerCard)}</div>
          {survivors.length === 0 && <p>В бункере никого не осталось.</p>}
        </section>
        {eliminated.length > 0 && (
          <section
            className="bunker-results-group is-eliminated"
            aria-labelledby="bunker-eliminated-title"
          >
            <h2 id="bunker-eliminated-title">
              <FiLogOut aria-hidden="true" /> За порогом <span>{eliminated.length}</span>
            </h2>
            <div className="bunker-results-players">{eliminated.map(renderPlayerCard)}</div>
          </section>
        )}
        {kicked.length > 0 && (
          <section className="bunker-results-group" aria-labelledby="bunker-kicked-title">
            <h2 id="bunker-kicked-title">
              Удалены из комнаты <span>{kicked.length}</span>
            </h2>
            <div className="bunker-results-players">{kicked.map(renderPlayerCard)}</div>
          </section>
        )}
        {gameState.voteResults && Object.keys(gameState.voteResults).length > 0 && (
          <section className="bunker-results-votes" aria-labelledby="bunker-last-vote-title">
            <h2 id="bunker-last-vote-title">Последнее голосование</h2>
            <ul>
              {Object.entries(gameState.voteResults)
                .sort(([, a], [, b]) => b - a)
                .map(([id, count]) => (
                  <li key={id}>
                    <span>
                      {gameState.players.find((player) => player.id === id)?.name ?? "Игрок"}
                    </span>
                    <meter
                      min={0}
                      max={Math.max(1, gameState.totalVotesExpected)}
                      value={count}
                      aria-label="Голосов"
                    />
                    <strong>{count}</strong>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
      <aside
        className={`results-command-bar${isHost ? " is-host" : ""}`}
        aria-label="Действия после игры"
      >
        <GameDockTools gameId="bunker" />
        <strong>{isHost ? "Партия завершена" : "Ждём решения хоста о новой партии"}</strong>
        {isHost && (
          <button
            className="btn btn-primary"
            onClick={playAgain}
            disabled={!connected || reconnectState !== "connected" || commandPending}
          >
            {commandPending ? "Возвращаем в лобби…" : "Сыграть ещё"}
          </button>
        )}
      </aside>
    </main>
  );
}
