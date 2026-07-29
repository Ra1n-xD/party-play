import type { AttributeType } from "../../../../shared/games/bunker/types";
import BackgroundParticles from "../../components/BackgroundParticles";
import { CardImage } from "../../components/CardImage";
import { GameScreen } from "../../screens/GameScreen";
import { ResultsScreen } from "../../screens/ResultsScreen";
import { VoteScreen } from "../../screens/VoteScreen";
import { LobbyScreen } from "../../platform/screens/LobbyScreen";
import { usePlatform } from "../../platform/context/PlatformContext";
import { BunkerGameProvider, useBunkerGame, type OverlayItem } from "./context/BunkerGameContext";

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
            <CardImage type={cardType} className="action-card-reveal-image" />
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
          <CardImage type="action" className="action-card-reveal-image" />
          <div className="action-card-reveal-title">{item.actionCard.title}</div>
          <div className="action-card-reveal-description">{item.actionCard.description}</div>
        </div>
      </div>
    </div>
  );
}

function BunkerView() {
  const { snapshot } = usePlatform();
  const { gameState, currentOverlay } = useBunkerGame();

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
      screen = <GameScreen />;
      break;
    case "ROUND_VOTE":
    case "ROUND_VOTE_TIEBREAK":
      screen = <VoteScreen />;
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
      {currentOverlay && <OverlayRenderer item={currentOverlay} />}
    </>
  );
}

export default function BunkerModule() {
  return (
    <BunkerGameProvider>
      <BackgroundParticles />
      <BunkerView />
    </BunkerGameProvider>
  );
}
