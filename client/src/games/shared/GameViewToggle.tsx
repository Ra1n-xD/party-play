export function GameViewToggle({ onOpen3D }: { onOpen3D: () => void }) {
  return (
    <div className="game-view-toggle" role="group" aria-label="Режим отображения">
      <button type="button" aria-pressed="true">
        2D
      </button>
      <button type="button" aria-pressed="false" onClick={onOpen3D}>
        3D
      </button>
    </div>
  );
}
