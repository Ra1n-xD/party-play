import { useGame } from "./context/GameContext";
import { OverlayItem } from "./context/GameContext";
import { HomeScreen } from "./screens/HomeScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { GameScreen } from "./screens/GameScreen";
import { VoteScreen } from "./screens/VoteScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import BackgroundParticles from "./components/BackgroundParticles";
import { CardImage } from "./components/CardImage";
import { AttributeType } from "../../shared/types";

const ATTR_LABELS: Record<AttributeType, string> = {
  profession: "раскрывает профессию",
  bio: "раскрывает биологию",
  health: "раскрывает здоровье",
  hobby: "раскрывает хобби",
  baggage: "раскрывает багаж",
  fact: "раскрывает доп. факт",
};

function AppContent() {
  const { roomCode, gameState } = useGame();

  // Not in a room
  if (!roomCode || !gameState) {
    return <HomeScreen />;
  }

  const phase = gameState.phase;

  switch (phase) {
    case "LOBBY":
      return <LobbyScreen />;
    case "CATASTROPHE_REVEAL":
    case "BUNKER_EXPLORE":
    case "ROUND_REVEAL":
    case "ROUND_DISCUSSION":
      return <GameScreen />;
    case "ROUND_VOTE":
    case "ROUND_VOTE_TIEBREAK":
      return <VoteScreen />;
    case "ROUND_RESULT":
      return <GameScreen />;
    case "GAME_OVER":
      return <ResultsScreen />;
    default:
      return <HomeScreen />;
  }
}

function PauseOverlay() {
  const { gameState, playerId, isSpectator } = useGame();
  if (!gameState?.paused) return null;
  if (!isSpectator) {
    const me = gameState.players.find((p) => p.id === playerId);
    if (me?.isHost) return null;
  }

  return (
    <div className="pause-overlay">
      <div className="pause-content">
        <span className="pause-icon">⏸</span>
        <h2>Пауза</h2>
        <p>Хост приостановил игру</p>
      </div>
    </div>
  );
}

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
    const cardType = item.attribute.type as AttributeType;
    return (
      <div className="action-card-reveal-overlay" data-card-type={cardType}>
        <div className="action-card-reveal-content">
          <div className="action-card-reveal-player">{item.playerName}</div>
          <div className="action-card-reveal-label">
            {ATTR_LABELS[cardType] || "раскрывает карту"}
          </div>
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

  if (item.kind === "actionCard") {
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

  return null;
}

function CurrentOverlay() {
  const { currentOverlay } = useGame();
  if (!currentOverlay) return null;
  return <OverlayRenderer item={currentOverlay} />;
}

export default function App() {
  return (
    <>
      <BackgroundParticles />
      <AppContent />
      <PauseOverlay />
      <CurrentOverlay />
      <div className="app-version">v{__APP_VERSION__}</div>
    </>
  );
}
