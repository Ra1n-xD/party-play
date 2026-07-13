import { useState } from "react";
import type { AttributeType, SeatClaimInfo } from "../../../../shared/types";
import type { ClientGameState } from "../../context/GameContext";
import { ATTR_TYPES } from "../../utils/constants";
import { toggleInSet } from "../../utils/setUtils";
import { AccessibleModal } from "./AccessibleModal";
import { ReconnectHostControls } from "./ReconnectHostControls";
import {
  getAdminActionReadiness,
  type AdminAction,
  type AdminSelection,
} from "./gameScreenViewModel";

interface HostControlDialogProps {
  open: boolean;
  gameState: ClientGameState;
  onClose: () => void;
  onShuffleAll: (type: AttributeType | "action") => void;
  onSwapAttribute: (player1Id: string, player2Id: string, type: AttributeType | "action") => void;
  onReplaceAttribute: (playerId: string, type: AttributeType | "action") => void;
  onDeleteAttribute: (playerId: string, type: AttributeType) => void;
  onForceRevealType: (type: AttributeType) => void;
  onRemoveBunkerCard: (index: number) => void;
  onReplaceBunkerCard: (index: number) => void;
  onRevivePlayer: (playerId: string) => void;
  onEliminatePlayer: (playerId: string) => void;
  onEndGame: () => void;
  seatClaims?: SeatClaimInfo[];
  onResolveSeatClaim?: (requestId: string, approved: boolean) => void;
  onKickPlayer?: (playerId: string) => void;
  onTransferHost?: (playerId: string) => void;
}

const ACTION_TITLES: Record<AdminAction, string> = {
  shuffle: "Перемешать карты",
  swap: "Поменять местами",
  replace: "Заменить карту",
  deleteAttr: "Удалить карту",
  forceReveal: "Раскрыть у всех",
  removeBunker: "Убрать карту бункера",
  replaceBunker: "Заменить карту бункера",
  revive: "Вернуть в игру",
  eliminate: "Изгнать игрока",
};

export function HostControlDialog({
  open,
  gameState,
  onClose,
  onShuffleAll,
  onSwapAttribute,
  onReplaceAttribute,
  onDeleteAttribute,
  onForceRevealType,
  onRemoveBunkerCard,
  onReplaceBunkerCard,
  onRevivePlayer,
  onEliminatePlayer,
  onEndGame,
  seatClaims = [],
  onResolveSeatClaim = () => undefined,
  onKickPlayer = () => undefined,
  onTransferHost = () => undefined,
}: HostControlDialogProps) {
  const [action, setAction] = useState<AdminAction | null>(null);
  const [attributeType, setAttributeType] = useState<AttributeType | "action">("profession");
  const [attributeTypes, setAttributeTypes] = useState<Set<AttributeType | "action">>(new Set());
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [players, setPlayers] = useState<Set<string>>(new Set());
  const [bunkerCardIndex, setBunkerCardIndex] = useState<number | null>(null);
  const [confirmEndGame, setConfirmEndGame] = useState(false);

  const resetForm = () => {
    setAction(null);
    setAttributeType("profession");
    setAttributeTypes(new Set());
    setPlayer1("");
    setPlayer2("");
    setPlayers(new Set());
    setBunkerCardIndex(null);
    setConfirmEndGame(false);
  };

  const close = () => {
    resetForm();
    onClose();
  };

  if (!open) return null;

  const alivePlayers = gameState.players.filter((player) => player.alive);
  const selection: AdminSelection = {
    player1,
    player2,
    players,
    attributeTypes,
    bunkerCardIndex,
  };
  const canApply = action !== null && getAdminActionReadiness(action, selection);

  const execute = () => {
    if (!action || !getAdminActionReadiness(action, selection)) return;

    if (action === "shuffle") {
      onShuffleAll(attributeType);
    } else if (action === "swap") {
      onSwapAttribute(player1, player2, attributeType);
    } else if (action === "replace") {
      for (const playerId of players) {
        for (const type of attributeTypes) onReplaceAttribute(playerId, type);
      }
    } else if (action === "deleteAttr") {
      for (const playerId of players) {
        for (const type of attributeTypes) {
          if (type !== "action") onDeleteAttribute(playerId, type);
        }
      }
    } else if (action === "forceReveal") {
      if (attributeType !== "action") onForceRevealType(attributeType);
    } else if (action === "removeBunker") {
      if (bunkerCardIndex !== null) onRemoveBunkerCard(bunkerCardIndex);
    } else if (action === "replaceBunker") {
      if (bunkerCardIndex !== null) onReplaceBunkerCard(bunkerCardIndex);
    } else if (action === "revive") {
      onRevivePlayer(player1);
    } else if (action === "eliminate") {
      onEliminatePlayer(player1);
    }

    resetForm();
  };

  const chooseAction = (nextAction: AdminAction) => {
    resetForm();
    setAction(nextAction);
  };

  return (
    <AccessibleModal
      labelledBy="gs-host-dialog-title"
      onClose={close}
      overlayClassName="gs-host-dialog"
      panelClassName="gs-host-dialog-panel"
    >
      <header className="gs-host-dialog-header">
        <h2 id="gs-host-dialog-title">Управление игрой</h2>
        <button type="button" className="btn btn-secondary" onClick={close}>
          Закрыть
        </button>
      </header>

      <ReconnectHostControls
        players={gameState.players}
        claims={seatClaims}
        onResolveClaim={onResolveSeatClaim}
        onKickPlayer={onKickPlayer}
        onTransferHost={onTransferHost}
      />

      {!action ? (
        <div className="gs-host-control-groups">
          <section aria-labelledby="gs-host-player-cards-title">
            <h3 id="gs-host-player-cards-title" className="admin-group-label">
              Карты игроков
            </h3>
            <div className="admin-actions-list">
              <button
                type="button"
                className="btn btn-admin"
                onClick={() => chooseAction("shuffle")}
              >
                Перемешать
              </button>
              <button type="button" className="btn btn-admin" onClick={() => chooseAction("swap")}>
                Поменять местами
              </button>
              <button
                type="button"
                className="btn btn-admin"
                onClick={() => chooseAction("replace")}
              >
                Заменить
              </button>
              <button
                type="button"
                className="btn btn-admin"
                onClick={() => chooseAction("deleteAttr")}
              >
                Удалить
              </button>
              <button
                type="button"
                className="btn btn-admin"
                onClick={() => chooseAction("forceReveal")}
              >
                Раскрыть у всех
              </button>
            </div>
          </section>

          <section aria-labelledby="gs-host-bunker-cards-title">
            <h3 id="gs-host-bunker-cards-title" className="admin-group-label">
              Карты бункера
            </h3>
            <div className="admin-actions-list">
              <button
                type="button"
                className="btn btn-admin"
                onClick={() => chooseAction("removeBunker")}
              >
                Убрать карту
              </button>
              <button
                type="button"
                className="btn btn-admin"
                onClick={() => chooseAction("replaceBunker")}
              >
                Заменить карту
              </button>
            </div>
          </section>

          <section aria-labelledby="gs-host-players-title">
            <h3 id="gs-host-players-title" className="admin-group-label">
              Игроки
            </h3>
            <div className="admin-actions-list">
              <button
                type="button"
                className="btn btn-admin"
                onClick={() => chooseAction("revive")}
              >
                Вернуть в игру
              </button>
              <button
                type="button"
                className="btn btn-admin"
                onClick={() => chooseAction("eliminate")}
              >
                Изгнать
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="admin-form">
          <h3>{ACTION_TITLES[action]}</h3>

          {action === "revive" || action === "eliminate" ? (
            <>
              <label>Игрок:</label>
              <div className="admin-chips">
                {gameState.players
                  .filter((player) => (action === "revive" ? !player.alive : player.alive))
                  .map((player) => (
                    <button
                      type="button"
                      key={player.id}
                      className={`admin-chip ${player1 === player.id ? "active" : ""}`}
                      aria-pressed={player1 === player.id}
                      onClick={() => setPlayer1(player.id)}
                    >
                      {player.name}
                    </button>
                  ))}
              </div>
            </>
          ) : action === "removeBunker" || action === "replaceBunker" ? (
            <>
              <label>Карта бункера:</label>
              <div className="admin-chips">
                {gameState.revealedBunkerCards.map((card, index) => (
                  <button
                    type="button"
                    key={index}
                    className={`admin-chip ${bunkerCardIndex === index ? "active" : ""}`}
                    aria-pressed={bunkerCardIndex === index}
                    onClick={() => setBunkerCardIndex(index)}
                  >
                    {card.title}
                  </button>
                ))}
              </div>
            </>
          ) : action === "forceReveal" ? (
            <>
              <label>Тип карты:</label>
              <div className="admin-chips">
                {ATTR_TYPES.filter((type) => type.type !== "action").map((type) => (
                  <button
                    type="button"
                    key={type.type}
                    className={`admin-chip ${attributeType === type.type ? "active" : ""}`}
                    aria-pressed={attributeType === type.type}
                    onClick={() => setAttributeType(type.type)}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </>
          ) : action === "deleteAttr" ? (
            <>
              <label>Тип карты (можно несколько):</label>
              <div className="admin-chips">
                {ATTR_TYPES.filter((type) => type.type !== "action").map((type) => (
                  <button
                    type="button"
                    key={type.type}
                    className={`admin-chip ${attributeTypes.has(type.type) ? "active" : ""}`}
                    aria-pressed={attributeTypes.has(type.type)}
                    onClick={() => setAttributeTypes(toggleInSet(attributeTypes, type.type))}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              <label>Игроки (можно несколько):</label>
              <div className="admin-chips">
                {alivePlayers.map((player) => (
                  <button
                    type="button"
                    key={player.id}
                    className={`admin-chip ${players.has(player.id) ? "active" : ""}`}
                    aria-pressed={players.has(player.id)}
                    onClick={() => setPlayers(toggleInSet(players, player.id))}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            </>
          ) : action === "replace" ? (
            <>
              <label>Тип карты (можно несколько):</label>
              <div className="admin-chips">
                {ATTR_TYPES.map((type) => (
                  <button
                    type="button"
                    key={type.type}
                    className={`admin-chip ${attributeTypes.has(type.type) ? "active" : ""}`}
                    aria-pressed={attributeTypes.has(type.type)}
                    onClick={() => setAttributeTypes(toggleInSet(attributeTypes, type.type))}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              <label>Игроки (можно несколько):</label>
              <div className="admin-chips">
                {alivePlayers.map((player) => (
                  <button
                    type="button"
                    key={player.id}
                    className={`admin-chip ${players.has(player.id) ? "active" : ""}`}
                    aria-pressed={players.has(player.id)}
                    onClick={() => setPlayers(toggleInSet(players, player.id))}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <label>Тип карты:</label>
              <div className="admin-chips">
                {ATTR_TYPES.map((type) => (
                  <button
                    type="button"
                    key={type.type}
                    className={`admin-chip ${attributeType === type.type ? "active" : ""}`}
                    aria-pressed={attributeType === type.type}
                    onClick={() => setAttributeType(type.type)}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              {action === "swap" && (
                <>
                  <label>Игрок 1:</label>
                  <div className="admin-chips">
                    {alivePlayers.map((player) => (
                      <button
                        type="button"
                        key={player.id}
                        className={`admin-chip ${player1 === player.id ? "active" : ""}`}
                        aria-pressed={player1 === player.id}
                        onClick={() => setPlayer1(player.id)}
                      >
                        {player.name}
                      </button>
                    ))}
                  </div>

                  <label>Игрок 2:</label>
                  <div className="admin-chips">
                    {alivePlayers
                      .filter((player) => player.id !== player1)
                      .map((player) => (
                        <button
                          type="button"
                          key={player.id}
                          className={`admin-chip ${player2 === player.id ? "active" : ""}`}
                          aria-pressed={player2 === player.id}
                          onClick={() => setPlayer2(player.id)}
                        >
                          {player.name}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </>
          )}

          <div className="admin-form-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={execute}
              disabled={!canApply}
            >
              Применить
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>
              Отмена
            </button>
          </div>
        </div>
      )}

      <section className="gs-host-danger-zone" aria-labelledby="gs-host-danger-title">
        <h3 id="gs-host-danger-title">Опасная зона</h3>
        {confirmEndGame ? (
          <>
            <p>Игра завершится для всех участников. Это действие нельзя отменить.</p>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                onEndGame();
                close();
              }}
            >
              Подтвердить завершение
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-danger" onClick={() => setConfirmEndGame(true)}>
            Закончить игру
          </button>
        )}
      </section>
    </AccessibleModal>
  );
}
