import { useEffect, useRef } from "react";
import { isTableInputBlocked } from "./TableLookControls";

/** Mouse shortcuts share the same selection and command handlers as the visible controls. */
export function useTableCardPointer(options: {
  enabled: boolean;
  cursorVisible: boolean;
  step: (direction: number) => void;
  select: () => void;
  play: () => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    let wheelDelta = 0;
    let lastWheel = 0;
    const inHandOrScene = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest(".table3d-canvas, .table3d-hand-inputs"));
    const allowed = (target: EventTarget | null) =>
      latest.current.enabled &&
      !window.matchMedia("(pointer: coarse)").matches &&
      !isTableInputBlocked(target) &&
      inHandOrScene(target);
    const wheel = (event: WheelEvent) => {
      if (!allowed(event.target) || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastWheel > 180) wheelDelta = 0;
      wheelDelta += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      if (Math.abs(wheelDelta) < 20 || now - lastWheel < 85) return;
      latest.current.step(Math.sign(wheelDelta));
      wheelDelta = 0;
      lastWheel = now;
    };
    const select = (event: MouseEvent) => {
      if (!allowed(event.target) || event.button !== 0 || latest.current.cursorVisible) return;
      // With Pointer Lock the canvas receives clicks; visible hand buttons select themselves.
      if (event.target instanceof Element && event.target.closest(".table3d-canvas"))
        latest.current.select();
    };
    const play = (event: MouseEvent) => {
      if (!allowed(event.target)) return;
      event.preventDefault();
      latest.current.play();
    };
    document.addEventListener("wheel", wheel, { passive: false });
    document.addEventListener("click", select);
    document.addEventListener("contextmenu", play);
    return () => {
      document.removeEventListener("wheel", wheel);
      document.removeEventListener("click", select);
      document.removeEventListener("contextmenu", play);
    };
  }, []);
}
