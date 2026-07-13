import React from "react";
import type { AttributeType, PlayerInfo } from "../../../../shared/types";
import { CardImage } from "../../components/CardImage";

const ATTRIBUTE_DISPLAY_ORDER: Record<AttributeType, number> = {
  profession: 0,
  bio: 1,
  health: 2,
  hobby: 3,
  baggage: 4,
  fact: 5,
};

export interface PlayerBoardProps {
  players: PlayerInfo[];
  playerId: string | null;
  currentTurnPlayerId: string | null;
  lastEliminatedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
}

interface PlayerCardProps {
  player: PlayerInfo;
  index: number;
  playerId: string | null;
  currentTurnPlayerId: string | null;
  lastEliminatedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
}

export function PlayerCard({
  player,
  index,
  playerId,
  currentTurnPlayerId,
  lastEliminatedPlayerId,
  onSelectPlayer,
}: PlayerCardProps) {
  const isMe = player.id === playerId;
  const isCurrentTurn = player.id === currentTurnPlayerId;
  const isLastEliminated = player.id === lastEliminatedPlayerId;
  const sortedRevealedAttributes = [...player.revealedAttributes].sort(
    (left, right) => ATTRIBUTE_DISPLAY_ORDER[left.type] - ATTRIBUTE_DISPLAY_ORDER[right.type],
  );
  const classNames = [
    "gs-player-card",
    isMe && "is-me",
    isCurrentTurn && "is-current-turn",
    !player.alive && "is-eliminated",
    !player.connected && "is-disconnected",
    player.kicked && "is-kicked",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classNames}
      onClick={() => onSelectPlayer(player.id)}
      aria-label={`Открыть карточку игрока ${player.name}`}
    >
      <span className="gs-player-heading">
        <span className="gs-player-number">{index + 1}</span>
        <strong>{player.name}</strong>
        {isMe && <span className="gs-status-pill">Вы</span>}
        {player.isBot && <span className="gs-status-pill">BOT</span>}
      </span>
      <span className="gs-player-states">
        {player.kicked ? (
          <span>Удалён администратором</span>
        ) : (
          <>
            {!player.alive && <span>Изгнан</span>}
            {!player.connected && !player.isBot && <span>Отключён</span>}
          </>
        )}
        {isCurrentTurn && <span>Сейчас ходит</span>}
        {isLastEliminated && <span>Голосует в этом раунде</span>}
      </span>
      <span className="gs-public-attributes">
        {player.revealedAttributes.length === 0 && !player.actionCard ? (
          <span className="gs-empty-copy">Пока ничего не раскрыто</span>
        ) : (
          <>
            {sortedRevealedAttributes.map((attribute, attributeIndex) => (
              <span
                key={`${attribute.type}-${attributeIndex}`}
                className="gs-public-attribute"
                data-attr-type={attribute.type}
              >
                <span className="gs-public-attribute-visual" aria-hidden="true">
                  <CardImage type={attribute.type} className="gs-public-attribute-icon" />
                </span>
                <span className="gs-public-attribute-copy">
                  <span>{attribute.label}</span>
                  <strong>{attribute.value}</strong>
                </span>
              </span>
            ))}
            {player.actionCard && (
              <span className="gs-public-attribute" data-attr-type="action">
                <span className="gs-public-attribute-visual" aria-hidden="true">
                  <CardImage type="action" className="gs-public-attribute-icon" />
                </span>
                <span className="gs-public-attribute-copy">
                  <span>Особое условие</span>
                  <strong>{player.actionCard.title}</strong>
                </span>
              </span>
            )}
          </>
        )}
      </span>
    </button>
  );
}

export function PlayerBoard({
  players,
  playerId,
  currentTurnPlayerId,
  lastEliminatedPlayerId,
  onSelectPlayer,
}: PlayerBoardProps) {
  const aliveCount = players.filter((player) => player.alive).length;

  return (
    <section className="gs-player-board" aria-label="Игроки">
      <div className="gs-section-heading">
        <h2>Игроки</h2>
        <span>{aliveCount} в игре</span>
      </div>
      <div className="gs-player-list">
        {players.map((player, index) => (
          <PlayerCard
            key={player.id}
            player={player}
            index={index}
            playerId={playerId}
            currentTurnPlayerId={currentTurnPlayerId}
            lastEliminatedPlayerId={lastEliminatedPlayerId}
            onSelectPlayer={onSelectPlayer}
          />
        ))}
      </div>
    </section>
  );
}
