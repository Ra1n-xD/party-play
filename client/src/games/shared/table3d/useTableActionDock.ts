import { useLayoutEffect, useState } from "react";

const DOCK_SELECTOR = ".uno-command-dock, .durak-command-dock, .gs-action-bar, .vote-command-bar";

export function useTableActionDock(enabled: boolean) {
  const [screen, setScreen] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const dock = screen?.querySelector<HTMLElement>(DOCK_SELECTOR);
    if (!enabled || !screen || !dock) return;

    // Wrapped actions and the device's safe area both contribute to the reserved scene space.
    const update = () => {
      screen.style.setProperty("--table3d-dock-height", `${dock.offsetHeight}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    return () => {
      observer.disconnect();
      screen.style.removeProperty("--table3d-dock-height");
    };
  }, [enabled, screen]);

  return setScreen;
}
