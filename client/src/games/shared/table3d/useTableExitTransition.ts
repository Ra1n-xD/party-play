import { useEffect, useRef, useState } from "react";
import type { RoomLifecycle } from "../../../../../shared/platform/room";
import { AVATAR_EXIT_DURATION_MS } from "./TableAvatarAnimator";

/** Keep the mounted 3D table visible when the last exclusion also ends the match. */
export function useTableExitTransition(
  roomCode: string | undefined,
  lifecycle: RoomLifecycle | undefined,
  eliminatedIds: string[],
) {
  const previous = useRef<{
    roomCode?: string;
    lifecycle?: RoomLifecycle;
    eliminated: Set<string>;
  }>({
    eliminated: new Set(),
  });
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const signature = JSON.stringify(eliminatedIds);
  const freshExit =
    roomCode === previous.current.roomCode &&
    previous.current.lifecycle === "playing" &&
    lifecycle === "results" &&
    eliminatedIds.some((id) => !previous.current.eliminated.has(id)) &&
    Boolean(document.querySelector(".is-3d")) &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    previous.current = { roomCode, lifecycle, eliminated: new Set(eliminatedIds) };
    if (freshExit) {
      setHolding(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setHolding(false);
      }, AVATAR_EXIT_DURATION_MS + 100);
    } else if (lifecycle !== "results") {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      setHolding(false);
    }
  }, [roomCode, lifecycle, signature, freshExit]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return lifecycle === "results" && (freshExit || holding);
}
