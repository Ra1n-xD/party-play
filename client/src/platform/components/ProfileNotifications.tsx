import { createPortal } from "react-dom";
import { LuLoaderCircle, LuWifiOff } from "react-icons/lu";
import { useProfile } from "../context/ProfileContext";

export function ProfileNotifications() {
  const { profile, connected, busy } = useProfile();
  if (!profile || (connected && !busy)) return null;

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
    </div>,
    document.body,
  );
}
