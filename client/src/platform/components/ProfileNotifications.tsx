import { createPortal } from "react-dom";
import { LuCircleAlert, LuLoaderCircle, LuWifiOff, LuX } from "react-icons/lu";
import { useProfile } from "../context/ProfileContext";

export function ProfileNotifications() {
  const { profile, connected, busy, error, clearError } = useProfile();
  if (!profile || (connected && !busy && !error)) return null;

  return createPortal(
    <div className="profile-notifications">
      {(!connected || busy) && (
        <div
          className={`profile-notification is-${connected ? "saving" : "offline"}`}
          role="status"
        >
          {connected ? (
            <LuLoaderCircle className="profile-notification-spinner" aria-hidden="true" />
          ) : (
            <LuWifiOff aria-hidden="true" />
          )}
          <span>{connected ? "Сохраняем…" : "Нет связи. Переподключаемся…"}</span>
        </div>
      )}
      {error && (
        <div className="profile-notification is-error" role="alert">
          <LuCircleAlert aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={clearError} aria-label="Закрыть уведомление об ошибке">
            <LuX aria-hidden="true" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
