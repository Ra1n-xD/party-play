import { useEffect, useRef } from "react";

interface WeddingConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function WeddingConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: WeddingConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="wedding-dialog-backdrop" onMouseDown={onCancel}>
      <section
        className="wedding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wedding-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="wedding-dialog-icon" aria-hidden="true">
          !
        </span>
        <h2 id="wedding-dialog-title">{title}</h2>
        <p>{description}</p>
        <div className="wedding-dialog-actions">
          <button
            className={
              destructive
                ? "wedding-button wedding-button-danger"
                : "wedding-button wedding-button-primary"
            }
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button
            ref={cancelRef}
            className="wedding-button wedding-button-outline"
            type="button"
            onClick={onCancel}
          >
            Отмена
          </button>
        </div>
      </section>
    </div>
  );
}
