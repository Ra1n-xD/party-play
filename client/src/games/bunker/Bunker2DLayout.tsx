import { useState, type CSSProperties, type ReactNode } from "react";
import { FiArrowRight, FiCheck, FiClock, FiShield, FiX, FiZap } from "react-icons/fi";
import type {
  AttributeType,
  Character,
  BunkerPlayerInfo,
} from "../../../../shared/games/bunker/types";
import type { ClientGameState } from "./context/BunkerGameContext";
import { usePlatform } from "../../platform/context/PlatformContext";
import { AvatarPortrait } from "../../platform/components/AvatarPortrait";
import { AccessibleModal } from "../../platform/components/AccessibleModal";
import { Timer } from "../../components/Timer";
import { ScenarioDetails } from "../../screens/game/ScenarioSummary";
import { BunkerAttributeIcon } from "./BunkerAttributeIcon";
import "./bunker-2d.css";

const FIELDS: { type: AttributeType; label: string }[] = [
  { type: "profession", label: "Профессия" },
  { type: "bio", label: "Биология" },
  { type: "health", label: "Здоровье" },
  { type: "hobby", label: "Хобби" },
  { type: "baggage", label: "Багаж" },
  { type: "fact", label: "Факт" },
];
const REVEAL_LABELS: Record<AttributeType, string> = {
  profession: "профессию",
  bio: "биологию",
  health: "здоровье",
  hobby: "хобби",
  baggage: "багаж",
  fact: "факт",
};

interface Bunker2DLayoutProps {
  gameState: ClientGameState;
  playerId: string | null;
  character: Character | null;
  phaseLabel: string;
  phaseDescription: string;
  revealedIndices?: Set<number>;
  canReveal?: boolean;
  onReveal?: (index: number) => void;
  canRevealAction?: boolean;
  onRevealAction?: () => void;
  voting?: {
    candidateIds: string[];
    selectedId: string | null;
    canSelect: boolean;
    onSelect: (id: string) => void;
    onConfirm: (id: string) => void;
  };
  progress?: ReactNode;
}

export function Bunker2DLayout({
  gameState,
  playerId,
  character,
  phaseLabel,
  phaseDescription,
  revealedIndices = new Set<number>(),
  canReveal = false,
  onReveal,
  canRevealAction = false,
  onRevealAction,
  voting,
  progress,
}: Bunker2DLayoutProps) {
  const { snapshot } = usePlatform();
  const [selectedId, setSelectedId] = useState<string | null>(playerId);
  const [ownDossier, setOwnDossier] = useState(Boolean(character));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [attributeIndex, setAttributeIndex] = useState<number | null>(null);
  const selectedPlayer =
    gameState.players.find((player) => player.id === selectedId) ?? gameState.players[0];
  const me = gameState.players.find((player) => player.id === playerId);
  const isOwn = ownDossier && Boolean(character && me);
  const dossierPlayer = isOwn ? me : selectedPlayer;
  const avatarFor = (id: string) =>
    snapshot?.seats.find((seat) => seat.seatId === id)?.avatarId ?? "human";
  const available =
    character?.attributes.flatMap((attribute, index) =>
      !revealedIndices.has(index) &&
      (gameState.roundNumber !== 1 || attribute.type === "profession")
        ? [index]
        : [],
    ) ?? [];
  const selectedAttribute =
    attributeIndex != null && available.includes(attributeIndex) ? attributeIndex : available[0];
  const activeAttribute =
    selectedAttribute != null ? character?.attributes[selectedAttribute] : undefined;
  const columns = gameState.players.length <= 4 ? 2 : gameState.players.length <= 12 ? 3 : 4;

  const openOnMobile = () => {
    if (window.matchMedia("(max-width: 900px)").matches) setDrawerOpen(true);
  };
  const selectPlayer = (player: BunkerPlayerInfo) => {
    setSelectedId(player.id);
    setOwnDossier(false);
    if (voting?.canSelect && voting.candidateIds.includes(player.id)) voting.onSelect(player.id);
    openOnMobile();
  };
  const showOwn = () => {
    setOwnDossier(true);
    openOnMobile();
  };

  const renderDossier = () => {
    if (!dossierPlayer) return null;
    const publicAttributes = dossierPlayer.revealedAttributes;
    const actionCard = isOwn
      ? character?.actionCard
      : dossierPlayer.actionCardRevealed
        ? dossierPlayer.actionCard
        : null;
    return (
      <div className="b2-dossier-content">
        <div className="b2-dossier-tabs" role="group" aria-label="Выбор досье">
          <button type="button" aria-pressed={!isOwn} onClick={() => setOwnDossier(false)}>
            Игрок
          </button>
          {character && (
            <button type="button" aria-pressed={isOwn} onClick={() => setOwnDossier(true)}>
              Моё досье{canReveal && <i aria-label="Сейчас ваш ход" />}
            </button>
          )}
        </div>
        <div className="b2-dossier-heading">
          <span className="b2-dossier-avatar">
            <AvatarPortrait avatarId={avatarFor(dossierPlayer.id)} />
          </span>
          <div>
            <small>{isOwn ? "Ваш персонаж" : "Публичное досье"}</small>
            <h2>{isOwn ? "Ваше досье" : "Досье " + dossierPlayer.name}</h2>
            <span>
              Раскрыто {new Set(publicAttributes.map((attribute) => attribute.type)).size} из 6
            </span>
          </div>
        </div>
        <div className="b2-dossier-fields">
          {FIELDS.map((field) => {
            const privateIndex =
              character?.attributes.findIndex((attribute) => attribute.type === field.type) ?? -1;
            const attribute = isOwn
              ? character?.attributes[privateIndex]
              : publicAttributes.find((item) => item.type === field.type);
            const isRevealed = isOwn ? revealedIndices.has(privateIndex) : Boolean(attribute);
            const selectable = isOwn && canReveal && available.includes(privateIndex);
            const content = (
              <>
                <BunkerAttributeIcon type={field.type} />
                <span>
                  <small>{field.label}</small>
                  <strong>
                    {attribute?.value ?? (isOwn ? "Нет характеристики" : "Не раскрыто")}
                  </strong>
                  {attribute?.detail && <span className="b2-field-detail">{attribute.detail}</span>}
                  {isOwn && <em>{isRevealed ? "Раскрыто всем" : "Видно только вам"}</em>}
                </span>
                {selectable && selectedAttribute === privateIndex && (
                  <FiCheck className="b2-field-selected-mark" aria-label="Выбрано для раскрытия" />
                )}
              </>
            );
            return selectable ? (
              <button
                key={field.type}
                type="button"
                className={["b2-dossier-field", selectedAttribute === privateIndex && "is-selected"]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={selectedAttribute === privateIndex}
                onClick={() => setAttributeIndex(privateIndex)}
              >
                {content}
              </button>
            ) : (
              <div
                key={field.type}
                className={["b2-dossier-field", !attribute && "is-hidden"]
                  .filter(Boolean)
                  .join(" ")}
              >
                {content}
              </div>
            );
          })}
          {actionCard && (
            <div className="b2-dossier-field b2-special-field">
              <BunkerAttributeIcon type="action" />
              <span>
                <small>Особое условие</small>
                <strong>{actionCard.title}</strong>
                <span className="b2-field-detail">{actionCard.description}</span>
                {isOwn && <em>{me?.actionCardRevealed ? "Раскрыто всем" : "Видно только вам"}</em>}
                {isOwn && canRevealAction && (
                  <button type="button" className="b2-special-action" onClick={onRevealAction}>
                    Раскрыть условие <FiArrowRight aria-hidden="true" />
                  </button>
                )}
              </span>
            </div>
          )}
        </div>
        <div className="b2-dossier-actions">
          {!isOwn && voting?.canSelect && voting.candidateIds.includes(dossierPlayer.id) && (
            <button
              type="button"
              className="btn btn-primary b2-reveal"
              onClick={() => {
                voting.onSelect(dossierPlayer.id);
                setDrawerOpen(false);
                voting.onConfirm(dossierPlayer.id);
              }}
            >
              Проголосовать
              <FiArrowRight aria-hidden="true" />
            </button>
          )}
          {isOwn && canReveal && activeAttribute && (
            <button
              type="button"
              className="btn btn-primary b2-reveal"
              onClick={() => selectedAttribute != null && onReveal?.(selectedAttribute)}
            >
              Раскрыть {REVEAL_LABELS[activeAttribute.type]}
              <FiArrowRight aria-hidden="true" />
            </button>
          )}
          {!isOwn && character && canReveal && (
            <button
              type="button"
              className="btn btn-primary b2-reveal"
              onClick={() => setOwnDossier(true)}
            >
              Ваш ход · моё досье
              <FiArrowRight aria-hidden="true" />
            </button>
          )}
          {!isOwn && <p className="b2-public-note">Здесь видны только раскрытые характеристики.</p>}
          {isOwn && !me?.alive && (
            <p className="b2-public-note">
              {me?.kicked ? "Вы удалены из комнаты" : "Вы изгнаны из бункера"}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="b2-workspace">
      <aside className="b2-scenario" aria-label="Сценарий">
        <span className="b2-paper-clip" aria-hidden="true" />
        <small>Сценарий катастрофы</small>
        <svg className="b2-catastrophe-image" viewBox="0 0 300 190" aria-hidden="true">
          <rect width="300" height="190" rx="7" fill="#263d49" />
          <circle cx="234" cy="47" r="28" fill="#eb9c54" />
          <path
            d="M0 132 39 102 75 120 112 84 158 123 203 97 254 126 300 102V190H0Z"
            fill="#456066"
          />
          <path
            d="M0 146H26V119H49V146H68V108H99V146H122V117H144V146H177V106H202V146H233V124H253V146H277V116H300V190H0Z"
            fill="#162c37"
          />
          <path d="M18 173Q151 129 282 173V190H18Z" fill="#b8ad8f" />
          <path
            d="M118 190V160Q150 135 182 160V190Z"
            fill="#192f3b"
            stroke="#d4c39a"
            strokeWidth="5"
          />
          <path d="M129 165H171M129 174H171M129 183H171" stroke="#8c9f9c" strokeWidth="3" />
          <path d="m53 36 10 17-20 0Z" fill="none" stroke="#e3bb73" strokeWidth="2" />
          <path d="M53 42v5m0 3v1" stroke="#e3bb73" strokeWidth="2" />
          <path d="m121 25-8 17h11l-7 17" fill="none" stroke="#e3bb73" strokeWidth="2" />
        </svg>
        <h2>{gameState.catastrophe?.title ?? "Сценарий загружается"}</h2>
        <p>{gameState.catastrophe?.description ?? "Ожидаем раскрытия катастрофы"}</p>
        <div className="b2-capacity">
          <FiShield aria-hidden="true" />
          <span>
            В бункере <strong>{gameState.bunkerCapacity}</strong> мест
          </span>
        </div>
        <details className="b2-scenario-details">
          <summary>
            Карты бункера · {gameState.revealedBunkerCards.length}/{gameState.totalBunkerCards}
          </summary>
          <ScenarioDetails idPrefix="b2-scenario" gameState={gameState} />
        </details>
        {progress}
      </aside>
      <header className="b2-phase" aria-live="polite">
        <div>
          <small>
            Раунд {gameState.roundNumber} из {gameState.totalRounds}
            {gameState.paused ? " · Пауза" : ""}
          </small>
          <h1>{phaseLabel}</h1>
          <p>{phaseDescription}</p>
        </div>
        <span className="b2-phase-timer">
          <FiClock aria-hidden="true" />
          {gameState.phaseEndTime && !gameState.paused ? (
            <Timer endTime={gameState.phaseEndTime} size="large" />
          ) : (
            <strong>{gameState.paused ? "Пауза" : "—"}</strong>
          )}
        </span>
      </header>
      <section className="b2-board" aria-label="Публичные досье участников">
        <div className="b2-board-heading">
          <h2>Участники · {gameState.players.length}</h2>
          <span>{gameState.players.filter((player) => player.alive).length} в игре</span>
          {character && (
            <button type="button" className="b2-own-shortcut" onClick={showOwn}>
              Моё досье{canReveal ? " · ваш ход" : ""}
            </button>
          )}
        </div>
        <div
          className={`b2-player-grid ${gameState.players.length > 12 ? "is-crowded" : ""}`}
          style={{ "--b2-columns": columns } as CSSProperties}
        >
          {gameState.players.map((player) => {
            const attributes = new Map(
              player.revealedAttributes.map((attribute) => [attribute.type, attribute]),
            );
            const selected = !isOwn && selectedPlayer?.id === player.id;
            const candidate = Boolean(voting?.candidateIds.includes(player.id));
            return (
              <button
                key={player.id}
                type="button"
                className={[
                  "b2-player-card",
                  selected && "is-selected",
                  player.id === gameState.currentTurnPlayerId && "is-current",
                  !player.alive && "is-eliminated",
                  player.kicked && "is-kicked",
                  voting?.selectedId === player.id && "is-vote-selected",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => selectPlayer(player)}
                aria-pressed={selected}
                aria-label={"Досье " + player.name + ", раскрыто " + attributes.size + " из 6"}
              >
                <span className="b2-player-heading">
                  <span className="b2-player-avatar">
                    <AvatarPortrait avatarId={avatarFor(player.id)} />
                  </span>
                  <strong title={player.name}>
                    <span className="b2-player-name">{player.name}</span>
                    {player.isBot && <small className="b2-bot-label">бот</small>}
                    {player.id === playerId && <small> · вы</small>}
                  </strong>
                  <span>{attributes.size}/6</span>
                </span>
                <span className="b2-player-fields">
                  {FIELDS.map((field) => {
                    const attribute = attributes.get(field.type);
                    return (
                      <span
                        key={field.type}
                        data-field={field.type}
                        className={["b2-player-field", !attribute && "is-hidden"]
                          .filter(Boolean)
                          .join(" ")}
                        title={field.label + ": " + (attribute?.value ?? "Не раскрыто")}
                      >
                        <BunkerAttributeIcon type={field.type} />
                        <span>{attribute?.value ?? field.label}</span>
                      </span>
                    );
                  })}
                </span>
                {(!player.connected ||
                  !player.alive ||
                  player.id === gameState.currentTurnPlayerId ||
                  player.temporaryBot ||
                  player.actionCardRevealed ||
                  candidate) && (
                  <span className="b2-player-state">
                    {player.kicked
                      ? "Удалён"
                      : !player.alive
                        ? "Изгнан"
                        : player.id === gameState.currentTurnPlayerId
                          ? "Сейчас ходит"
                          : player.temporaryBot
                            ? "Временно бот"
                            : !player.connected
                              ? "Нет связи"
                              : candidate
                                ? voting?.selectedId === player.id
                                  ? "Кандидат выбран"
                                  : "Кандидат"
                                : ""}
                    {player.actionCardRevealed && <FiZap aria-label="Особое условие раскрыто" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="b2-board-hint">Нажмите на игрока, чтобы открыть полное досье</p>
      </section>
      <aside className="b2-dossier" aria-label={isOwn ? "Личное досье" : "Досье выбранного игрока"}>
        {renderDossier()}
      </aside>
      {drawerOpen && (
        <AccessibleModal
          labelledBy="b2-mobile-dossier-title"
          onClose={() => setDrawerOpen(false)}
          overlayClassName="b2-drawer-overlay"
          panelClassName="b2-drawer"
        >
          <div className="b2-drawer-heading">
            <h2 id="b2-mobile-dossier-title">Досье</h2>
            <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Закрыть досье">
              <FiX />
            </button>
          </div>
          {renderDossier()}
        </AccessibleModal>
      )}
    </div>
  );
}
