export function CardTurnNotice({
  visible,
  label = "Ваш ход",
}: {
  visible: boolean;
  label?: string;
}) {
  if (!visible) return null;
  return (
    <div className="card-game-turn-notice" role="status">
      <span aria-hidden="true">◆</span> {label}
    </div>
  );
}
