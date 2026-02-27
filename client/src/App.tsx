import { useGame } from "./context/GameContext";
import { HomeScreen } from "./screens/HomeScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { GameScreen } from "./screens/GameScreen";
import { VoteScreen } from "./screens/VoteScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import BackgroundParticles from "./components/BackgroundParticles";
import { CardImage } from "./components/CardImage";
import { PhaseAnnouncement } from "./components/PhaseAnnouncement";

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

function PhaseAnnouncementOverlay() {
  const { announcement, dismissAnnouncement } = useGame();
  if (!announcement) return null;

  return (
    <PhaseAnnouncement
      title={announcement.title}
      subtitle={announcement.subtitle}
      description={announcement.description}
      onDismiss={dismissAnnouncement}
    />
  );
}

function PauseOverlay() {
  const { gameState, playerId } = useGame();
  if (!gameState?.paused) return null;
  const me = gameState.players.find((p) => p.id === playerId);
  if (me?.isHost) return null;

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

function ActionCardRevealOverlay() {
  const { revealedActionCard } = useGame();
  if (!revealedActionCard) return null;

  return (
    <div className="action-card-reveal-overlay">
      <div className="action-card-reveal-content">
        <div className="action-card-reveal-player">{revealedActionCard.playerName}</div>
        <div className="action-card-reveal-label">раскрывает особое условие</div>
        <div className="action-card-reveal-card">
          <CardImage type="action" className="action-card-reveal-image" />
          <div className="action-card-reveal-title">{revealedActionCard.actionCard.title}</div>
          <div className="action-card-reveal-description">
            {revealedActionCard.actionCard.description}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <BackgroundParticles />
      <AppContent />
      <PhaseAnnouncementOverlay />
      <PauseOverlay />
      <ActionCardRevealOverlay />
    </>
  );
}
