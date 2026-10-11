import { useId } from "react";
import { createPortal } from "react-dom";
import { LuCircleAlert, LuCircleCheck, LuInfo, LuX } from "react-icons/lu";
import { AccessibleModal } from "./AccessibleModal";
import "../../styles/notification-dialog.css";

interface NotificationDialogProps {
  message: string;
  title?: string;
  kind?: "success" | "error" | "info";
  onClose: () => void;
  action?: { label: string; onClick: () => void };
}

const titles = {
  success: "Готово",
  error: "Не получилось",
  info: "Уведомление",
};

export function NotificationDialog({
  message,
  title,
  kind = "info",
  onClose,
  action,
}: NotificationDialogProps) {
  const titleId = useId();
  const Icon = kind === "error" ? LuCircleAlert : kind === "success" ? LuCircleCheck : LuInfo;

  if (typeof document === "undefined") return null;

  return createPortal(
    <AccessibleModal
      labelledBy={titleId}
      onClose={onClose}
      dismissible={false}
      priority={18000}
      overlayClassName="notification-dialog-overlay"
      panelClassName={`party-dialog notification-dialog is-${kind}`}
    >
      <div className="notification-dialog-header">
        <span className="notification-dialog-icon" aria-hidden="true">
          <Icon />
        </span>
        <button
          type="button"
          className="notification-dialog-close"
          onClick={onClose}
          aria-label="Закрыть уведомление"
        >
          <LuX aria-hidden="true" />
        </button>
      </div>
      <div className="notification-dialog-body">
        <h2 id={titleId}>{title ?? titles[kind]}</h2>
        <p>{message}</p>
      </div>
      <div className="notification-dialog-actions">
        {action && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              action.onClick();
            }}
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          className={`btn ${action ? "btn-secondary" : "btn-primary"}`}
          onClick={onClose}
        >
          Понятно
        </button>
      </div>
    </AccessibleModal>,
    document.body,
  );
}
