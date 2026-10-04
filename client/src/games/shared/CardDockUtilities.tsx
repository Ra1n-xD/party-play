import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FiMoreHorizontal } from "react-icons/fi";

/** Secondary commands collapse together; game actions keep their own fixed positions. */
export function CardDockUtilities({
  children,
  attention = 0,
}: {
  children: ReactNode;
  attention?: number;
}) {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 680px), (pointer: coarse)").matches,
  );
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const media = window.matchMedia("(max-width: 680px), (pointer: coarse)");
    const resize = () => {
      setCompact(media.matches);
      setOpen(false);
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target) &&
        !(
          event.target instanceof Element &&
          event.target.closest('[role="dialog"], .room-reactions-popover')
        )
      )
        setOpen(false);
    };
    media.addEventListener("change", resize);
    document.addEventListener("pointerdown", outside);
    return () => {
      media.removeEventListener("change", resize);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);
  return (
    <div
      className="card-dock-utilities"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      {compact && (
        <button
          ref={trigger}
          type="button"
          className="btn card-dock-more"
          aria-label={attention ? `Ещё действия, требует внимания: ${attention}` : "Ещё действия"}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <FiMoreHorizontal aria-hidden="true" />
          <span>Ещё</span>
          {attention > 0 && <span className="card-manage-badge">{attention}</span>}
        </button>
      )}
      <div
        id={id}
        className="card-dock-utility-items"
        hidden={compact && !open}
        data-table-input-block={compact && open ? "" : undefined}
      >
        {children}
      </div>
    </div>
  );
}
