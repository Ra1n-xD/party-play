import { useGameViewPreference } from "../context/GameViewPreferenceContext";
import "../../styles/game-view-preference.css";

export function GameViewPreference() {
  const { gameView, setGameView } = useGameViewPreference();
  return (
    <div className="game-view-preference">
      <span>Вид игр по умолчанию</span>
      <div className="game-view-preference-toggle" role="group" aria-label="Вид игр по умолчанию">
        {(["2d", "3d"] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={gameView === view}
            onClick={() => setGameView(view)}
          >
            {view.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
