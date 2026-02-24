import { useGame } from './context/GameContext';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { VoteScreen } from './screens/VoteScreen';
import { ResultsScreen } from './screens/ResultsScreen';

function AppContent() {
  const { roomCode, gameState } = useGame();

  // Not in a room
  if (!roomCode || !gameState) {
    return <HomeScreen />;
  }

  const phase = gameState.phase;

  switch (phase) {
    case 'LOBBY':
      return <LobbyScreen />;
    case 'CATASTROPHE_REVEAL':
    case 'BUNKER_EXPLORE':
    case 'ROUND_REVEAL':
    case 'ROUND_DISCUSSION':
      return <GameScreen />;
    case 'ROUND_VOTE':
    case 'ROUND_VOTE_TIEBREAK':
      return <VoteScreen />;
    case 'ROUND_RESULT':
      return <GameScreen />;
    case 'GAME_OVER':
      return <ResultsScreen />;
    default:
      return <HomeScreen />;
  }
}

export default function App() {
  return <AppContent />;
}
