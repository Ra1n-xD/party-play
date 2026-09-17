import { useEffect, useRef } from "react";
import { isTableInputBlocked } from "./TableLookControls";

/** Return true only for a key handled by this screen. Native dialog navigation stays intact. */
export function useTableHotkeys(
  enabled: boolean,
  handle: (code: string) => boolean,
  inDialog = false,
) {
  const latest = useRef({ enabled, handle, inDialog });
  latest.current = { enabled, handle, inDialog };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = latest.current;
      if (!state.enabled || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable]")
      )
        return;
      if (!state.inDialog && isTableInputBlocked(event.target)) return;
      if (
        ["Space", "Enter"].includes(event.code) &&
        event.target instanceof HTMLElement &&
        event.target.closest("button, summary")
      )
        return;
      if (state.handle(event.code)) event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
