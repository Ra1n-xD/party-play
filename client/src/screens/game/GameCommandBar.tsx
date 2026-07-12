import { FiEye, FiMic, FiSettings, FiSkipForward, FiZap } from "react-icons/fi";
import type { PlayerInfo } from "../../../../shared/types";

interface GameCommandBarProps {
  currentTurnPlayer?: PlayerInfo;
  isMyTurn: boolean;
  phaseLabel: string;
  phaseDescription: string;
  canReveal: boolean;
  canRevealAction: boolean;
  canManageGame: boolean;
  canSkipDiscussion: boolean;
  hostControlsOpen: boolean;
  onReveal: () => void;
  onRevealAction: () => void;
  onOpenHostControls: () => void;
  onSkipDiscussion: () => void;
}

export function GameCommandBar({
  currentTurnPlayer,
  isMyTurn,
  phaseLabel,
  phaseDescription,
  canReveal,
  canRevealAction,
  canManageGame,
  canSkipDiscussion,
  hostControlsOpen,
  onReveal,
  onRevealAction,
  onOpenHostControls,
  onSkipDiscussion,
}: GameCommandBarProps) {
  const profession = currentTurnPlayer?.revealedAttributes.find(
    (attribute) => attribute.type === "profession",
  )?.value;
  const statusTitle = currentTurnPlayer
    ? isMyTurn
      ? `Сейчас ваш ход · ${currentTurnPlayer.name}`
      : `Сейчас ходит ${currentTurnPlayer.name}`
    : phaseLabel;
  const statusDetail = profession ? `Профессия: ${profession}` : phaseDescription;

  return (
    <aside className="gs-action-bar" aria-label="Панель хода и игровых действий">
      <div className="gs-command-status" role="status" aria-live="polite" aria-atomic="true">
        <span className="gs-command-status-icon" aria-hidden="true">
          <FiMic />
        </span>
        <span className="gs-command-status-copy">
          <small>{currentTurnPlayer ? "Текущий ход" : "Текущий этап"}</small>
          <strong>{statusTitle}</strong>
          <span>{statusDetail}</span>
        </span>
      </div>

      <div className="gs-command-actions" aria-label="Доступные действия">
        {canRevealAction && (
          <button
            type="button"
            className="btn btn-reveal-action gs-command-button"
            onClick={onRevealAction}
          >
            <FiZap aria-hidden="true" />
            <span>Раскрыть особое условие</span>
          </button>
        )}
        {canManageGame && (
          <button
            type="button"
            className="btn btn-secondary gs-command-button"
            onClick={onSkipDiscussion}
            disabled={!canSkipDiscussion}
            aria-label={
              canSkipDiscussion
                ? "Пропустить обсуждение"
                : "Пропустить обсуждение — доступно только во время обсуждения"
            }
            title={
              canSkipDiscussion
                ? "Завершить обсуждение и перейти к голосованию"
                : "Доступно во время обсуждения"
            }
          >
            <FiSkipForward aria-hidden="true" />
            <span>Пропустить обсуждение</span>
          </button>
        )}
        {canManageGame && (
          <button
            type="button"
            className="btn btn-secondary gs-command-button"
            onClick={onOpenHostControls}
            aria-label="Управление игрой"
            aria-haspopup="dialog"
            aria-expanded={hostControlsOpen}
          >
            <FiSettings aria-hidden="true" />
            <span>Админ-панель</span>
          </button>
        )}
        {canReveal && (
          <button
            type="button"
            className="btn btn-primary btn-reveal gs-command-button"
            onClick={onReveal}
          >
            <FiEye aria-hidden="true" />
            <span>Раскрыть характеристику</span>
          </button>
        )}
      </div>
    </aside>
  );
}
