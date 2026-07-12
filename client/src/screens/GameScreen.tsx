import { useEffect, useState, type CSSProperties } from "react";
import {
  FiAlertTriangle,
  FiCheckSquare,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiEye,
  FiHome,
  FiLock,
  FiLogOut,
  FiMic,
  FiRadio,
  FiSettings,
  FiShield,
  FiWifi,
  FiWifiOff,
  FiX,
} from "react-icons/fi";
import { useGame } from "../context/GameContext";
import { Timer } from "../components/Timer";
import { CardImage } from "../components/CardImage";
import { AttributeType } from "../../../shared/types";
import { ATTR_TYPES } from "../utils/constants";
import { toggleInSet } from "../utils/setUtils";
import {
  buildPlayerAttributeSlots,
  countRevealedCards,
  getInitials,
  getPlayerStateLabel,
} from "./gameScreenView";
import "./GameScreen.css";

const PLAYER_ACCENTS = [
  "#efbd58",
  "#79c6a0",
  "#a6c96f",
  "#d696be",
  "#d69b83",
  "#8fc4d1",
  "#d0b07a",
  "#9aaee8",
];

const PHASE_LABELS: Record<string, string> = {
  CATASTROPHE_REVEAL: "Катастрофа",
  BUNKER_EXPLORE: "Исследование бункера",
  ROUND_REVEAL: "Раскрытие карт",
  ROUND_DISCUSSION: "Обсуждение",
  ROUND_VOTE: "Голосование",
  ROUND_RESULT: "Результат раунда",
};

type AdminAction =
  | "shuffle"
  | "swap"
  | "replace"
  | "deleteAttr"
  | "forceReveal"
  | "removeBunker"
  | "replaceBunker"
  | "revive"
  | "eliminate";

export function GameScreen() {
  const {
    connected,
    roomCode,
    gameState,
    playerId,
    isSpectator,
    myCharacter,
    revealAttribute,
    revealActionCard,
    endGame,
    leaveRoom,
    error,
    adminShuffleAll,
    adminSwapAttribute,
    adminReplaceAttribute,
    adminRemoveBunkerCard,
    adminReplaceBunkerCard,
    adminDeleteAttribute,
    adminForceRevealType,
    adminPause,
    adminUnpause,
    adminSkipDiscussion,
    adminRevivePlayer,
    adminEliminatePlayer,
    pendingAdminOpen,
    consumePendingAdminOpen,
  } = useGame();

  const [showAttrPicker, setShowAttrPicker] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [confirmRevealAction, setConfirmRevealAction] = useState(false);
  const [scenarioCollapsed, setScenarioCollapsed] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminAction, setAdminAction] = useState<AdminAction | null>(null);
  const [adminAttrType, setAdminAttrType] = useState<AttributeType | "action">("profession");
  const [adminAttrTypes, setAdminAttrTypes] = useState<Set<AttributeType | "action">>(new Set());
  const [adminPlayer1, setAdminPlayer1] = useState("");
  const [adminPlayer2, setAdminPlayer2] = useState("");
  const [adminPlayers, setAdminPlayers] = useState<Set<string>>(new Set());
  const [adminBunkerCardIndex, setAdminBunkerCardIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!pendingAdminOpen) return;

    consumePendingAdminOpen();
    const me = gameState?.players.find((player) => player.id === playerId);
    if (me?.isHost && !adminOpen) {
      setAdminOpen(true);
      adminPause();
    }
  }, [pendingAdminOpen]);

  useEffect(() => {
    if (!adminOpen && !showAttrPicker && !expandedPlayerId && !confirmRevealAction) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (confirmRevealAction) {
        setConfirmRevealAction(false);
      } else if (showAttrPicker) {
        setShowAttrPicker(false);
      } else if (expandedPlayerId) {
        setExpandedPlayerId(null);
      } else if (adminOpen) {
        setAdminOpen(false);
        setAdminAction(null);
        setAdminPlayer1("");
        setAdminPlayer2("");
        setAdminPlayers(new Set());
        setAdminAttrTypes(new Set());
        setAdminBunkerCardIndex(null);
        adminUnpause();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [adminOpen, showAttrPicker, expandedPlayerId, confirmRevealAction, adminUnpause]);

  if (!gameState) return null;

  const me = isSpectator ? undefined : gameState.players.find((player) => player.id === playerId);

  if (!isSpectator && !myCharacter) {
    return (
      <div className="screen game-screen command-game command-game-loading">
        <FiRadio aria-hidden="true" />
        <span>Получаем данные персонажа…</span>
      </div>
    );
  }

  const isMyTurn = !isSpectator && gameState.currentTurnPlayerId === playerId;
  const alivePlayers = gameState.players.filter((player) => player.alive);
  const currentTurnPlayer = gameState.players.find(
    (player) => player.id === gameState.currentTurnPlayerId,
  );

  const revealedIndices = new Set<number>();
  if (me && myCharacter) {
    for (const revealedAttribute of me.revealedAttributes) {
      const index = myCharacter.attributes.findIndex(
        (attribute, candidateIndex) =>
          !revealedIndices.has(candidateIndex) &&
          attribute.type === revealedAttribute.type &&
          attribute.value === revealedAttribute.value,
      );
      if (index !== -1) revealedIndices.add(index);
    }
  }

  const unrevealedIndices = myCharacter
    ? myCharacter.attributes.map((_, index) => index).filter((index) => !revealedIndices.has(index))
    : [];
  const canReveal =
    !isSpectator && gameState.phase === "ROUND_REVEAL" && isMyTurn && unrevealedIndices.length > 1;
  const canRevealAction = Boolean(
    !isSpectator && myCharacter?.actionCard && !me?.actionCardRevealed,
  );
  const canSkipDiscussion = gameState.phase === "ROUND_DISCUSSION" && Boolean(me?.isHost);
  const hasBottomAction = canReveal || canRevealAction || canSkipDiscussion;
  const openedCards = countRevealedCards(gameState.players);
  const totalCards = gameState.players.length * 7;
  const openedConditions = gameState.players.filter((player) => player.actionCardRevealed).length;

  const phaseDescription = (() => {
    if (gameState.phase === "ROUND_REVEAL") {
      if (isMyTurn) {
        return gameState.roundNumber === 1
          ? "Ваш ход — раскройте профессию"
          : "Ваш ход — выберите характеристику";
      }
      return currentTurnPlayer
        ? `Ход игрока ${currentTurnPlayer.name}`
        : "Ожидание следующего хода";
    }
    if (gameState.phase === "ROUND_DISCUSSION") return "Обсудите, кто должен остаться в бункере";
    if (gameState.phase === "BUNKER_EXPLORE") return "Открыта новая карта бункера";
    if (gameState.phase === "CATASTROPHE_REVEAL") return "Ознакомьтесь со сценарием катастрофы";
    if (gameState.phase === "ROUND_RESULT") return "Подводим итоги голосования";
    return "Следуйте текущему этапу игры";
  })();

  const resetAdminForm = () => {
    setAdminAction(null);
    setAdminPlayer1("");
    setAdminPlayer2("");
    setAdminPlayers(new Set());
    setAdminAttrTypes(new Set());
    setAdminBunkerCardIndex(null);
  };

  const openAdmin = () => {
    if (adminOpen) return;
    setAdminOpen(true);
    adminPause();
  };

  const closeAdmin = () => {
    if (!adminOpen) return;
    setAdminOpen(false);
    resetAdminForm();
    adminUnpause();
  };

  const handleReveal = (attributeIndex: number) => {
    revealAttribute(attributeIndex);
    setShowAttrPicker(false);
  };

  const handleAdminExecute = () => {
    if (!adminAction) return;

    if (adminAction === "shuffle") {
      adminShuffleAll(adminAttrType);
    } else if (adminAction === "swap") {
      if (adminPlayer1 && adminPlayer2 && adminPlayer1 !== adminPlayer2) {
        adminSwapAttribute(adminPlayer1, adminPlayer2, adminAttrType);
      }
    } else if (adminAction === "replace") {
      for (const targetPlayerId of adminPlayers) {
        for (const type of adminAttrTypes) adminReplaceAttribute(targetPlayerId, type);
      }
    } else if (adminAction === "deleteAttr") {
      for (const targetPlayerId of adminPlayers) {
        for (const type of adminAttrTypes) {
          if (type !== "action") adminDeleteAttribute(targetPlayerId, type);
        }
      }
    } else if (adminAction === "forceReveal") {
      if (adminAttrType !== "action") adminForceRevealType(adminAttrType);
    } else if (adminAction === "removeBunker") {
      if (adminBunkerCardIndex !== null) adminRemoveBunkerCard(adminBunkerCardIndex);
    } else if (adminAction === "replaceBunker") {
      if (adminBunkerCardIndex !== null) adminReplaceBunkerCard(adminBunkerCardIndex);
    } else if (adminAction === "revive") {
      if (adminPlayer1) adminRevivePlayer(adminPlayer1);
    } else if (adminAction === "eliminate") {
      if (adminPlayer1) adminEliminatePlayer(adminPlayer1);
    }

    resetAdminForm();
  };

  const adminExecuteDisabled =
    !adminAction ||
    (adminAction === "swap" && (!adminPlayer1 || !adminPlayer2)) ||
    (adminAction === "replace" && (adminPlayers.size === 0 || adminAttrTypes.size === 0)) ||
    (adminAction === "deleteAttr" && (adminPlayers.size === 0 || adminAttrTypes.size === 0)) ||
    ((adminAction === "removeBunker" || adminAction === "replaceBunker") &&
      adminBunkerCardIndex === null) ||
    ((adminAction === "revive" || adminAction === "eliminate") && !adminPlayer1);

  return (
    <div className={`screen game-screen command-game ${hasBottomAction ? "has-bottom-bar" : ""}`}>
      <header className="command-game-header">
        <div className="command-brand">
          <span className="command-brand-icon" aria-hidden="true">
            <FiHome />
          </span>
          <span className="command-brand-copy">
            <strong>Бункер</strong>
            <small>Протокол выживания</small>
          </span>
        </div>

        <div className="command-header-actions">
          {roomCode && (
            <div className="command-room-code" aria-label={`Код комнаты ${roomCode}`}>
              <span>Комната</span>
              <strong>{roomCode}</strong>
            </div>
          )}
          <div className={`command-connection ${connected ? "is-online" : "is-offline"}`}>
            {connected ? <FiWifi aria-hidden="true" /> : <FiWifiOff aria-hidden="true" />}
            <span>{connected ? "Связь установлена" : "Нет соединения"}</span>
          </div>
          {me?.isHost && (
            <button
              type="button"
              className="command-icon-button"
              onClick={openAdmin}
              aria-label="Управление игрой"
            >
              <FiSettings />
            </button>
          )}
          <button
            type="button"
            className="command-icon-button"
            onClick={leaveRoom}
            aria-label="Выйти из комнаты"
          >
            <FiLogOut />
          </button>
        </div>
      </header>

      <main className="command-game-main">
        <section className="command-status-panel" aria-label="Состояние игры">
          <button
            type="button"
            className="command-scenario-summary"
            onClick={() => setScenarioCollapsed((collapsed) => !collapsed)}
            aria-expanded={!scenarioCollapsed}
            aria-controls="command-scenario-details"
          >
            <span className="command-scenario-icon" aria-hidden="true">
              <FiAlertTriangle />
            </span>
            <span className="command-scenario-copy">
              <small>Сценарий катастрофы · раунд {gameState.roundNumber}</small>
              <strong>{gameState.catastrophe?.title || "Сценарий загружается"}</strong>
              <span>{gameState.catastrophe?.description || phaseDescription}</span>
            </span>
            <span className="command-scenario-chevron" aria-hidden="true">
              {scenarioCollapsed ? <FiChevronDown /> : <FiChevronUp />}
            </span>
          </button>

          <div className="command-status-grid">
            <div className="command-metric command-timer-metric">
              <span className="command-metric-label">
                <FiClock aria-hidden="true" />
                {gameState.phase === "ROUND_DISCUSSION" ? "До голосования" : "До конца этапа"}
              </span>
              <Timer endTime={gameState.phaseEndTime} size="large" />
              <small>{phaseDescription}</small>
            </div>
            <div className="command-metric">
              <span className="command-metric-label">
                <FiShield aria-hidden="true" /> Мест
              </span>
              <strong>
                {gameState.bunkerCapacity}
                <span>/{alivePlayers.length}</span>
              </strong>
              <small>осталось в бункере</small>
            </div>
            <div className="command-metric command-round-metric">
              <span className="command-metric-label">
                <FiRadio aria-hidden="true" /> Раунд
              </span>
              <strong>
                {gameState.roundNumber}
                <span>/{gameState.totalRounds}</span>
              </strong>
              <small>{PHASE_LABELS[gameState.phase] || gameState.phase}</small>
            </div>
            <div className="command-progress-metric">
              <span>
                <strong>Раскрытие характеристик</strong>
                <b>
                  {String(gameState.roundNumber).padStart(2, "0")} /{" "}
                  {String(gameState.totalRounds).padStart(2, "0")}
                </b>
              </span>
              <div
                className="command-round-track"
                aria-label={`Раунд ${gameState.roundNumber} из ${gameState.totalRounds}`}
              >
                {Array.from({ length: gameState.totalRounds }, (_, index) => (
                  <i key={index} className={index < gameState.roundNumber ? "is-filled" : ""} />
                ))}
              </div>
            </div>
          </div>

          {!scenarioCollapsed && (
            <div id="command-scenario-details" className="command-scenario-details">
              {gameState.revealedBunkerCards.length > 0 && (
                <div className="command-detail-group">
                  <h3>
                    Бункер · {gameState.revealedBunkerCards.length}/{gameState.totalBunkerCards}
                  </h3>
                  <div className="command-bunker-cards">
                    {gameState.revealedBunkerCards.map((card, index) => (
                      <article key={`${card.title}-${index}`}>
                        <strong>{card.title}</strong>
                        <span>{card.description}</span>
                      </article>
                    ))}
                  </div>
                </div>
              )}
              {gameState.threatCard && (
                <div className="command-detail-group command-threat-detail">
                  <h3>Угроза</h3>
                  <article>
                    <strong>{gameState.threatCard.title}</strong>
                    <span>{gameState.threatCard.description}</span>
                  </article>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="command-participants" aria-labelledby="command-participants-title">
          <div className="command-section-heading">
            <div>
              <h2 id="command-participants-title">Участники</h2>
              <p>
                Открыто {openedCards} из {totalCards} характеристик · условия {openedConditions}/
                {gameState.players.length}
              </p>
            </div>
            <div className="command-status-legend" aria-label="Обозначения">
              <span className="is-self">Ваш персонаж</span>
              <span className="is-speaking">Сейчас говорит</span>
            </div>
          </div>

          <div className="command-player-strip" aria-label="Список участников">
            {gameState.players.map((player, index) => (
              <span
                key={player.id}
                className={player.id === playerId ? "is-active" : ""}
                style={
                  {
                    "--player-accent": PLAYER_ACCENTS[index % PLAYER_ACCENTS.length],
                  } as CSSProperties
                }
              >
                <i /> {player.name}
              </span>
            ))}
          </div>

          <div className="command-player-grid">
            {gameState.players.map((player, index) => {
              const isMe = !isSpectator && player.id === playerId;
              const isCurrentTurn = gameState.currentTurnPlayerId === player.id;
              const slots = buildPlayerAttributeSlots(player, isMe, isMe ? myCharacter : null);
              const publicCount =
                player.revealedAttributes.length + (player.actionCardRevealed ? 1 : 0);
              const accent = PLAYER_ACCENTS[index % PLAYER_ACCENTS.length];

              return (
                <button
                  type="button"
                  key={player.id}
                  className={`command-player-card ${isMe ? "is-me" : ""} ${isCurrentTurn ? "is-current-turn" : ""} ${!player.alive ? "is-eliminated" : ""} ${!player.connected ? "is-disconnected" : ""}`}
                  style={{ "--player-accent": accent } as CSSProperties}
                  onClick={() => setExpandedPlayerId(player.id)}
                  aria-label={`Открыть карточку игрока ${player.name}`}
                >
                  <span className="command-player-header">
                    <span className="command-player-avatar">{getInitials(player.name)}</span>
                    <span className="command-player-identity">
                      <strong>
                        {player.name}
                        {isMe && <b>Вы</b>}
                        {player.isBot && <b>BOT</b>}
                      </strong>
                      <small>
                        <i /> Игрок {String(index + 1).padStart(2, "0")} ·{" "}
                        {player.connected || player.isBot ? "в сети" : "не в сети"}
                      </small>
                    </span>
                    <span className={`command-player-state ${isCurrentTurn ? "is-speaking" : ""}`}>
                      {isCurrentTurn && <FiMic aria-hidden="true" />}
                      {getPlayerStateLabel(
                        player,
                        gameState.currentTurnPlayerId,
                        gameState.lastEliminatedPlayerId,
                      )}
                    </span>
                  </span>

                  <span className="command-attribute-grid">
                    {slots.map((slot) => (
                      <span
                        key={slot.type}
                        className={`command-attribute-slot ${slot.value ? "is-visible" : "is-locked"} ${slot.isPrivate ? "is-private" : ""} ${slot.type === "fact" || slot.type === "action" ? "is-wide" : ""}`}
                        data-attr-type={slot.type}
                      >
                        <span className="command-attribute-icon">
                          {slot.value ? (
                            <CardImage type={slot.type} className="command-card-image" />
                          ) : (
                            <FiLock aria-hidden="true" />
                          )}
                        </span>
                        <span className="command-attribute-copy">
                          <small>{slot.label}</small>
                          <strong>{slot.value || "Закрыто"}</strong>
                          {slot.detail && slot.type === "action" && <em>{slot.detail}</em>}
                        </span>
                        {slot.isPrivate && (
                          <span className="command-private-mark" title="Видно только вам">
                            <FiLock aria-hidden="true" />
                          </span>
                        )}
                      </span>
                    ))}
                  </span>

                  <span className="command-player-footer">
                    <span
                      className="command-card-progress"
                      aria-label={`${publicCount} из 7 открыто`}
                    >
                      <span>
                        {Array.from({ length: 7 }, (_, progressIndex) => (
                          <i
                            key={progressIndex}
                            className={progressIndex < publicCount ? "is-filled" : ""}
                          />
                        ))}
                      </span>
                      <small>{publicCount}/7 открыто</small>
                    </span>
                    <span className="command-player-footer-state">
                      <FiCheckSquare aria-hidden="true" /> {player.alive ? "В игре" : "Изгнан"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      {hasBottomAction && (
        <div className="command-bottom-bar">
          <div className="command-bottom-context">
            <span className="command-bottom-context-icon">
              <FiMic aria-hidden="true" />
            </span>
            <span>
              <strong>
                {isMyTurn
                  ? "Сейчас ваш ход"
                  : currentTurnPlayer
                    ? `Сейчас говорит ${currentTurnPlayer.name}`
                    : PHASE_LABELS[gameState.phase] || "Текущий этап"}
              </strong>
              <small>{phaseDescription}</small>
            </span>
          </div>
          <div className="command-bottom-actions">
            {canSkipDiscussion && (
              <button
                type="button"
                className="command-action command-action-secondary"
                onClick={adminSkipDiscussion}
              >
                <FiCheckSquare aria-hidden="true" /> Пропустить обсуждение
              </button>
            )}
            {canRevealAction && (
              <button
                type="button"
                className="command-action command-action-condition"
                onClick={() => setConfirmRevealAction(true)}
              >
                <FiCheckSquare aria-hidden="true" /> Особое условие
              </button>
            )}
            {canReveal && (
              <button
                type="button"
                className="command-action command-action-primary"
                onClick={() => {
                  if (gameState.roundNumber === 1) revealAttribute(0);
                  else setShowAttrPicker(true);
                }}
              >
                <FiEye aria-hidden="true" /> Раскрыть карту
                <b>{unrevealedIndices.length}</b>
              </button>
            )}
          </div>
        </div>
      )}

      {adminOpen && me?.isHost && (
        <div className="command-admin-overlay" role="presentation" onMouseDown={closeAdmin}>
          <section
            className="admin-panel command-admin-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-admin-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="command-admin-header">
              <div>
                <span>Пауза активна</span>
                <h2 id="command-admin-title">Управление игрой</h2>
              </div>
              <button
                type="button"
                className="command-icon-button"
                onClick={closeAdmin}
                aria-label="Закрыть управление"
                autoFocus
              >
                <FiX />
              </button>
            </div>

            {!adminAction ? (
              <div className="admin-actions-list">
                <label className="admin-group-label">Карты игроков</label>
                <button className="btn btn-admin" onClick={() => setAdminAction("shuffle")}>
                  Перемешать
                </button>
                <button className="btn btn-admin" onClick={() => setAdminAction("swap")}>
                  Поменять местами
                </button>
                <button className="btn btn-admin" onClick={() => setAdminAction("replace")}>
                  Заменить
                </button>
                <button className="btn btn-admin" onClick={() => setAdminAction("deleteAttr")}>
                  Удалить
                </button>
                <button className="btn btn-admin" onClick={() => setAdminAction("forceReveal")}>
                  Раскрыть у всех
                </button>
                <label className="admin-group-label">Карты бункера</label>
                <button className="btn btn-admin" onClick={() => setAdminAction("removeBunker")}>
                  Убрать карту
                </button>
                <button className="btn btn-admin" onClick={() => setAdminAction("replaceBunker")}>
                  Заменить карту
                </button>
                <label className="admin-group-label">Игроки</label>
                <button className="btn btn-admin" onClick={() => setAdminAction("revive")}>
                  Вернуть в игру
                </button>
                <button className="btn btn-admin" onClick={() => setAdminAction("eliminate")}>
                  Изгнать
                </button>
                <button className="btn btn-danger command-end-game" onClick={endGame}>
                  Закончить игру
                </button>
              </div>
            ) : (
              <div className="admin-form">
                <h3>
                  {adminAction === "shuffle" && "Перемешать карты"}
                  {adminAction === "swap" && "Поменять местами"}
                  {adminAction === "replace" && "Заменить карту"}
                  {adminAction === "deleteAttr" && "Удалить карту"}
                  {adminAction === "forceReveal" && "Раскрыть у всех"}
                  {adminAction === "removeBunker" && "Убрать карту бункера"}
                  {adminAction === "replaceBunker" && "Заменить карту бункера"}
                  {adminAction === "revive" && "Вернуть в игру"}
                  {adminAction === "eliminate" && "Изгнать игрока"}
                </h3>

                {(adminAction === "revive" || adminAction === "eliminate") && (
                  <>
                    <label>Игрок</label>
                    <div className="admin-chips">
                      {gameState.players
                        .filter((player) =>
                          adminAction === "revive" ? !player.alive : player.alive,
                        )
                        .map((player) => (
                          <button
                            key={player.id}
                            className={`admin-chip ${adminPlayer1 === player.id ? "active" : ""}`}
                            onClick={() => setAdminPlayer1(player.id)}
                          >
                            {player.name}
                          </button>
                        ))}
                    </div>
                  </>
                )}

                {(adminAction === "removeBunker" || adminAction === "replaceBunker") && (
                  <>
                    <label>Карта бункера</label>
                    <div className="admin-chips">
                      {gameState.revealedBunkerCards.map((card, index) => (
                        <button
                          key={`${card.title}-${index}`}
                          className={`admin-chip ${adminBunkerCardIndex === index ? "active" : ""}`}
                          onClick={() => setAdminBunkerCardIndex(index)}
                        >
                          {card.title}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {(adminAction === "shuffle" ||
                  adminAction === "swap" ||
                  adminAction === "forceReveal") && (
                  <>
                    <label>Тип карты</label>
                    <div className="admin-chips">
                      {ATTR_TYPES.filter(
                        (type) => adminAction !== "forceReveal" || type.type !== "action",
                      ).map((type) => (
                        <button
                          key={type.type}
                          className={`admin-chip ${adminAttrType === type.type ? "active" : ""}`}
                          onClick={() => setAdminAttrType(type.type)}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {(adminAction === "replace" || adminAction === "deleteAttr") && (
                  <>
                    <label>Тип карты (можно несколько)</label>
                    <div className="admin-chips">
                      {ATTR_TYPES.filter(
                        (type) => adminAction !== "deleteAttr" || type.type !== "action",
                      ).map((type) => (
                        <button
                          key={type.type}
                          className={`admin-chip ${adminAttrTypes.has(type.type) ? "active" : ""}`}
                          onClick={() => setAdminAttrTypes(toggleInSet(adminAttrTypes, type.type))}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                    <label>Игроки (можно несколько)</label>
                    <div className="admin-chips">
                      {alivePlayers.map((player) => (
                        <button
                          key={player.id}
                          className={`admin-chip ${adminPlayers.has(player.id) ? "active" : ""}`}
                          onClick={() => setAdminPlayers(toggleInSet(adminPlayers, player.id))}
                        >
                          {player.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {adminAction === "swap" && (
                  <>
                    <label>Игрок 1</label>
                    <div className="admin-chips">
                      {alivePlayers.map((player) => (
                        <button
                          key={player.id}
                          className={`admin-chip ${adminPlayer1 === player.id ? "active" : ""}`}
                          onClick={() => setAdminPlayer1(player.id)}
                        >
                          {player.name}
                        </button>
                      ))}
                    </div>
                    <label>Игрок 2</label>
                    <div className="admin-chips">
                      {alivePlayers
                        .filter((player) => player.id !== adminPlayer1)
                        .map((player) => (
                          <button
                            key={player.id}
                            className={`admin-chip ${adminPlayer2 === player.id ? "active" : ""}`}
                            onClick={() => setAdminPlayer2(player.id)}
                          >
                            {player.name}
                          </button>
                        ))}
                    </div>
                  </>
                )}

                <div className="admin-form-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleAdminExecute}
                    disabled={adminExecuteDisabled}
                  >
                    Применить
                  </button>
                  <button className="btn btn-secondary" onClick={resetAdminForm}>
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {showAttrPicker && myCharacter && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowAttrPicker(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attribute-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="attribute-picker-title">Выберите характеристику для раскрытия</h3>
            <p>Одна карта должна остаться закрытой до финала</p>
            <div className="target-list">
              {unrevealedIndices.map((index, position) => (
                <button
                  key={index}
                  className="btn btn-target"
                  onClick={() => handleReveal(index)}
                  autoFocus={position === 0}
                >
                  {myCharacter.attributes[index].label}: {myCharacter.attributes[index].value}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAttrPicker(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {expandedPlayerId &&
        (() => {
          const player = gameState.players.find((candidate) => candidate.id === expandedPlayerId);
          if (!player) return null;
          const isMe = !isSpectator && player.id === playerId;
          const slots = buildPlayerAttributeSlots(player, isMe, isMe ? myCharacter : null);
          const playerNumber =
            gameState.players.findIndex((candidate) => candidate.id === player.id) + 1;

          return (
            <div
              className="modal-overlay"
              role="presentation"
              onClick={() => setExpandedPlayerId(null)}
            >
              <div
                className="modal expanded-player-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`Карточка игрока ${player.name}`}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="modal-close-btn"
                  onClick={() => setExpandedPlayerId(null)}
                  aria-label="Закрыть"
                  autoFocus
                >
                  &times;
                </button>
                <div className="expanded-player-header">
                  <span className="player-number">{playerNumber}</span>
                  <h3>
                    {player.isBot && <span className="bot-badge">BOT</span>}
                    {player.name}
                    {isMe && <span className="me-badge">ВЫ</span>}
                  </h3>
                  {!player.alive && <span className="eliminated-badge">ИЗГНАН</span>}
                </div>
                <div className="attributes-grid">
                  {slots.map((slot) => (
                    <div
                      key={slot.type}
                      className={`attribute-card ${slot.value ? "revealed" : "hidden"}`}
                      data-attr-type={slot.type}
                    >
                      <div className="attr-content">
                        {slot.value ? (
                          <CardImage type={slot.type} className="attr-card-image" />
                        ) : (
                          <FiLock className="attr-card-image" aria-hidden="true" />
                        )}
                        <div className="attr-text">
                          <span className="attr-label">{slot.label}</span>
                          <span className="attr-value">{slot.value || "Закрыто"}</span>
                          {slot.detail && <span className="attr-detail">{slot.detail}</span>}
                        </div>
                      </div>
                      {!slot.isPublic && (
                        <span className="attr-status">
                          {slot.isPrivate ? "Видно вам" : "Скрыто"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

      {error && <div className="error-toast">{error}</div>}

      {confirmRevealAction && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setConfirmRevealAction(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reveal-action-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="reveal-action-title">Раскрыть особое условие?</h3>
            <p>Это действие нельзя отменить. Все игроки увидят вашу карту.</p>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                autoFocus
                onClick={() => {
                  revealActionCard();
                  setConfirmRevealAction(false);
                }}
              >
                Раскрыть
              </button>
              <button className="btn btn-secondary" onClick={() => setConfirmRevealAction(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
