import { useLayoutEffect, useState } from "react";
import type { AttributeType } from "../../../../shared/games/bunker/types";
import { BunkerAttributeIcon } from "./BunkerAttributeIcon";
import { GameScreen } from "../../screens/GameScreen";
import { ResultsScreen } from "../../screens/ResultsScreen";
import { VoteScreen } from "../../screens/VoteScreen";
import { LobbyScreen } from "../../platform/screens/LobbyScreen";
import { usePlatform } from "../../platform/context/PlatformContext";
import { AccessibleModal } from "../../platform/components/AccessibleModal";
import { BunkerGameProvider, useBunkerGame, type OverlayItem } from "./context/BunkerGameContext";

import "../shared/table3d/table3d.css";
import "./bunker-3d.css";

const ATTRIBUTE_LABELS: Record<AttributeType, string> = {
  profession: "раскрывает профессию",
  bio: "раскрывает биологию",
  health: "раскрывает здоровье",
  hobby: "раскрывает хобби",
  baggage: "раскрывает багаж",
  fact: "раскрывает доп. факт",
};

function OverlayRenderer({ item }: { item: OverlayItem }) {
  if (item.kind === "announcement") {
    return (
      <div className="phase-announcement-overlay">
        <div className="phase-announcement-content">
          <div className="phase-announcement-title">{item.title}</div>
          {item.subtitle && <div className="phase-announcement-subtitle">{item.subtitle}</div>}
          {item.description && (
            <div className="phase-announcement-description">{item.description}</div>
          )}
        </div>
      </div>
    );
  }

  if (item.kind === "attribute") {
    const cardType = item.attribute.type;
    return (
      <div className="action-card-reveal-overlay" data-card-type={cardType}>
        <div className="action-card-reveal-content">
          <div className="action-card-reveal-player">{item.playerName}</div>
          <div className="action-card-reveal-label">{ATTRIBUTE_LABELS[cardType]}</div>
          <div className="action-card-reveal-card" data-card-type={cardType}>
            <BunkerAttributeIcon type={cardType} className="action-card-reveal-image" />
            <div className="action-card-reveal-title">{item.attribute.value}</div>
            {item.attribute.detail && (
              <div className="action-card-reveal-description">{item.attribute.detail}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="action-card-reveal-overlay" data-card-type="action">
      <div className="action-card-reveal-content">
        <div className="action-card-reveal-player">{item.playerName}</div>
        <div className="action-card-reveal-label">раскрывает особое условие</div>
        <div className="action-card-reveal-card" data-card-type="action">
          <BunkerAttributeIcon type="action" className="action-card-reveal-image" />
          <div className="action-card-reveal-title">{item.actionCard.title}</div>
          <div className="action-card-reveal-description">{item.actionCard.description}</div>
        </div>
      </div>
    </div>
  );
}

function VoteEventNotice({
  item,
  paused,
  votingOpen,
}: {
  item: OverlayItem;
  paused: boolean;
  votingOpen: boolean;
}) {
  const title =
    item.kind === "announcement"
      ? item.title
      : item.kind === "attribute"
        ? item.attribute.value
        : item.actionCard.title;
  const subtitle =
    item.kind === "announcement"
      ? item.subtitle
      : `${item.playerName} ${item.kind === "attribute" ? ATTRIBUTE_LABELS[item.attribute.type] : "раскрывает особое условие"}`;
  const description =
    item.kind === "announcement"
      ? item.description
      : item.kind === "attribute"
        ? item.attribute.detail
        : item.actionCard.description;

  return (
    <aside className="bunker-vote-event-notice" aria-label="Игровое событие" data-table-input-block>
      <div role="status" aria-live="polite" aria-atomic="true">
        {subtitle && <span>{subtitle}</span>}
        <strong>{title}</strong>
      </div>
      {description && (
        <details key={`${title}:${description}`}>
          <summary>{item.kind === "actionCard" ? "Прочитать условие" : "Подробнее"}</summary>
          <p>{description}</p>
        </details>
      )}
      <small>
        {paused
          ? "Голосование на паузе"
          : votingOpen
            ? "Голосование продолжается"
            : "Кандидаты защищают своё место"}
      </small>
    </aside>
  );
}

function BunkerView() {
  const [is3D, setIs3D] = useState(true);
  const { snapshot } = usePlatform();
  const { gameState, currentOverlay } = useBunkerGame();
  const isVoteScreen =
    gameState?.phase === "ROUND_VOTE" || gameState?.phase === "ROUND_VOTE_TIEBREAK";

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [isVoteScreen]);

  if (!snapshot) {
    return (
      <div className="screen platform-room-loading" role="status">
        Загружаем комнату…
      </div>
    );
  }

  if (snapshot.lifecycle === "lobby") {
    const activeSeatCount = snapshot.seats.filter((seat) => !seat.closed).length;
    return (
      <LobbyScreen extraInfo={<span>В бункер попадут: {Math.floor(activeSeatCount / 2)}</span>} />
    );
  }

  let screen;
  switch (gameState?.phase) {
    case "CATASTROPHE_REVEAL":
    case "BUNKER_EXPLORE":
    case "ROUND_REVEAL":
    case "ROUND_DISCUSSION":
    case "ROUND_RESULT":
      screen = <GameScreen is3D={is3D} onToggle3D={() => setIs3D((value) => !value)} />;
      break;
    case "ROUND_VOTE":
    case "ROUND_VOTE_TIEBREAK":
      screen = (
        <VoteScreen
          is3D={is3D}
          onToggle3D={() => setIs3D((value) => !value)}
          eventNotice={
            currentOverlay ? (
              <VoteEventNotice
                item={currentOverlay}
                paused={gameState.paused}
                votingOpen={gameState.votingOpen}
              />
            ) : undefined
          }
        />
      );
      break;
    case "GAME_OVER":
      screen = <ResultsScreen />;
      break;
    default:
      screen = (
        <div className="screen platform-room-loading" role="status">
          Загружаем игру…
        </div>
      );
  }

  return (
    <>
      {screen}
      {currentOverlay &&
        !isVoteScreen &&
        (is3D && currentOverlay.kind === "announcement" && currentOverlay.eliminatedPlayerId ? (
          <div className="table3d-elimination-notice" role="status">
            <strong>{currentOverlay.subtitle}</strong>
            <span>Покидает бункер</span>
          </div>
        ) : (
          <AccessibleModal
            labelledBy="bunker-event-title"
            onClose={() => undefined}
            dismissible={false}
            overlayClassName="bunker-event-overlay"
            panelClassName="bunker-event-panel"
          >
            <h2 id="bunker-event-title" hidden>
              Игровое событие
            </h2>
            <OverlayRenderer item={currentOverlay} />
            <p className="bunker-event-wait" role="status">
              Продолжим автоматически после показа события
            </p>
          </AccessibleModal>
        ))}
    </>
  );
}

export default function BunkerModule() {
  return (
    <BunkerGameProvider>
      <BunkerView />
    </BunkerGameProvider>
  );
}
