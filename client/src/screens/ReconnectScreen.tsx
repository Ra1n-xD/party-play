import { useState } from "react";
import { useGame } from "../context/GameContext";

interface ReconnectScreenProps {
  onBack: () => void;
}

export function ReconnectScreen({ onBack }: ReconnectScreenProps) {
  const {
    reconnectableSeats,
    reconnectableSeatsRoomCode,
    seatLookupState,
    retainedReconnectSession,
    pendingSeatClaim,
    resumeRetainedSession,
    listReconnectableSeats,
    clearReconnectableSeats,
    resetSeatRecovery,
    requestSeatClaim,
    cancelSeatClaim,
    error,
  } = useGame();
  const [roomCode, setRoomCode] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [claimantName, setClaimantName] = useState("");

  const normalizedRoomCode = roomCode.trim().toUpperCase();
  const claimInProgress =
    pendingSeatClaim?.status === "submitting" ||
    pendingSeatClaim?.status === "waiting" ||
    pendingSeatClaim?.status === "cancelling";
  const claimTransitionLocked = claimInProgress || pendingSeatClaim?.status === "approved";
  const seatsMatchRoom = reconnectableSeatsRoomCode === normalizedRoomCode;
  const lookupMatchesRoom = seatLookupState.roomCode === normalizedRoomCode;
  const lookupPending = lookupMatchesRoom && seatLookupState.status === "pending";
  const lookupCompletedEmpty =
    lookupMatchesRoom && seatLookupState.status === "complete" && reconnectableSeats.length === 0;

  const findSeats = () => {
    if (normalizedRoomCode.length < 4) return;
    setSelectedPlayerId(null);
    listReconnectableSeats(normalizedRoomCode);
  };

  const submitClaim = () => {
    if (!seatsMatchRoom || !selectedPlayerId || !claimantName.trim()) return;
    requestSeatClaim(normalizedRoomCode, selectedPlayerId, claimantName.trim());
  };

  const changeRoomCode = (value: string) => {
    setRoomCode(value.toUpperCase());
    setSelectedPlayerId(null);
    clearReconnectableSeats();
  };

  const goBack = () => {
    if (claimTransitionLocked) return;
    resetSeatRecovery();
    onBack();
  };

  return (
    <div className="reconnect-screen home-actions">
      <div className="reconnect-screen-heading">
        <span className="reconnect-eyebrow">Возвращение в комнату</span>
        <h2>Восстановление места</h2>
        <p>Найдите своё прежнее место и отправьте заявку текущему хосту.</p>
      </div>

      {retainedReconnectSession && !pendingSeatClaim && (
        <div className="reconnect-claim-status is-approved">
          <strong>Сохранённое место · {retainedReconnectSession.roomCode}</strong>
          <p>Можно вернуться напрямую в этом браузере без подтверждения хоста.</p>
          <button type="button" className="btn btn-primary" onClick={resumeRetainedSession}>
            Продолжить игру · {retainedReconnectSession.roomCode}
          </button>
        </div>
      )}

      {!pendingSeatClaim && (
        <>
          <label className="reconnect-field">
            <span>Код комнаты</span>
            <input
              type="text"
              className="input input-code"
              aria-label="Код комнаты"
              value={roomCode}
              onChange={(event) => changeRoomCode(event.target.value)}
              maxLength={8}
              autoFocus
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={findSeats}
            disabled={normalizedRoomCode.length < 4 || lookupPending}
          >
            {lookupPending ? "Ищем места…" : "Найти места"}
          </button>

          {lookupCompletedEmpty && (
            <div className="reconnect-claim-status is-cancelled" role="status">
              <strong>Нет доступных мест</strong>
              <p>Проверьте код комнаты или дождитесь отключения нужного игрока.</p>
            </div>
          )}

          {seatsMatchRoom && reconnectableSeats.length > 0 && (
            <div className="reconnect-seat-list" aria-label="Доступные места">
              {reconnectableSeats.map((seat) => (
                <button
                  type="button"
                  key={seat.playerId}
                  className={`reconnect-seat ${selectedPlayerId === seat.playerId ? "is-selected" : ""}`}
                  aria-pressed={selectedPlayerId === seat.playerId}
                  onClick={() => setSelectedPlayerId(seat.playerId)}
                >
                  <span>{seat.playerName}</span>
                  <strong>Выбрать место {seat.playerName}</strong>
                </button>
              ))}
            </div>
          )}

          {selectedPlayerId && (
            <label className="reconnect-field">
              <span>Как вас показать игрокам</span>
              <input
                type="text"
                className="input"
                aria-label="Ваше имя"
                value={claimantName}
                onChange={(event) => setClaimantName(event.target.value)}
                maxLength={20}
                placeholder="Ваше имя"
              />
            </label>
          )}

          {selectedPlayerId && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitClaim}
              disabled={!claimantName.trim()}
            >
              Отправить заявку
            </button>
          )}
        </>
      )}

      {pendingSeatClaim && (
        <div className={`reconnect-claim-status is-${pendingSeatClaim.status}`} role="status">
          <strong>
            {claimInProgress
              ? "Ждём решения хоста"
              : pendingSeatClaim.status === "approved"
                ? "Заявка одобрена"
                : "Заявка завершена"}
          </strong>
          <p>
            {pendingSeatClaim.message ??
              (claimInProgress
                ? "Не закрывайте страницу. После одобрения подключение продолжится автоматически."
                : "Можно вернуться назад и попробовать снова.")}
          </p>
          {pendingSeatClaim.status === "waiting" && (
            <button type="button" className="btn btn-secondary" onClick={cancelSeatClaim}>
              Отменить заявку
            </button>
          )}
          {["rejected", "cancelled"].includes(pendingSeatClaim.status) && (
            <button type="button" className="btn btn-secondary" onClick={findSeats}>
              Попробовать снова
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="reconnect-inline-error" role="alert">
          {error}
        </div>
      )}
      <button
        type="button"
        className="btn btn-text"
        onClick={goBack}
        disabled={claimTransitionLocked}
      >
        Назад
      </button>
    </div>
  );
}
