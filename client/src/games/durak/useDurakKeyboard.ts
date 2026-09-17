import { useEffect, useRef } from "react";
import type { DurakCard } from "../../../../shared/games/durak/types";
import { isTableInputBlocked } from "../shared/table3d/TableLookControls";

interface Options {
  enabled: boolean;
  canAct: boolean;
  hand: DurakCard[];
  focusedCardId: string | null;
  focusCard: (id: string) => void;
  targetIds: string[];
  focusedTargetId: string | null;
  focusTarget: (id: string) => void;
  selectCard: (card: DurakCard) => void;
  play: () => void;
  secondary: () => void;
  sort: () => void;
}

export function useDurakKeyboard(options: Options) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const state = current.current;
      if (
        !state.enabled ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        isTableInputBlocked(event.target)
      )
        return;
      const code = event.code;
      if (
        ![
          "KeyA",
          "KeyD",
          "ArrowLeft",
          "ArrowRight",
          "KeyW",
          "KeyS",
          "ArrowUp",
          "ArrowDown",
          "Space",
          "KeyE",
          "Enter",
          "KeyF",
          "KeyC",
        ].includes(code)
      )
        return;
      // Native controls retain Enter/Space when the cursor is released and a button is focused.
      if (
        ["Space", "Enter"].includes(code) &&
        event.target instanceof HTMLElement &&
        event.target.closest("button, summary")
      )
        return;
      event.preventDefault();
      if (["KeyA", "KeyD", "ArrowLeft", "ArrowRight"].includes(code)) {
        if (!state.hand.length) return;
        const index = Math.max(
          0,
          state.hand.findIndex((card) => card.id === state.focusedCardId),
        );
        const step = code === "KeyA" || code === "ArrowLeft" ? -1 : 1;
        state.focusCard(state.hand[(index + step + state.hand.length) % state.hand.length].id);
        return;
      }
      if (["KeyW", "KeyS", "ArrowUp", "ArrowDown"].includes(code)) {
        if (!state.targetIds.length) return;
        const index = Math.max(0, state.targetIds.indexOf(state.focusedTargetId ?? ""));
        const step = code === "KeyW" || code === "ArrowUp" ? -1 : 1;
        state.focusTarget(
          state.targetIds[(index + step + state.targetIds.length) % state.targetIds.length],
        );
        return;
      }
      if (event.repeat) return;
      if (code === "KeyC") {
        state.sort();
        return;
      }
      if (!state.canAct) return;
      if (code === "Space") {
        const card = state.hand.find((card) => card.id === state.focusedCardId) ?? state.hand[0];
        if (card) state.selectCard(card);
      } else if (code === "KeyE" || code === "Enter") state.play();
      else if (code === "KeyF") state.secondary();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);
}
