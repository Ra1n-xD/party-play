export function RoomLoading({
  message = "Загружаем комнату…",
  onCancel,
}: {
  message?: string;
  onCancel?: () => void;
}) {
  return (
    <div className="screen platform-room-loading" role="status">
      <span className="platform-loading-mark" aria-hidden="true">
        ◆
      </span>
      <p>{message}</p>
      {onCancel && (
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Вернуться на главную
        </button>
      )}
    </div>
  );
}
