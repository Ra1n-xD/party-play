import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiSmile } from "react-icons/fi";
import type { RoomReactionId } from "../../../../shared/platform/reactions";
import { usePlatform } from "../context/PlatformContext";

const LOCAL_COOLDOWN_MS = 1_200;
const POPOVER_WIDTH = 286;
const POPOVER_HEIGHT = 206;
const POPOVER_MARGIN = 12;
const POPOVER_GAP = 9;

interface PopoverPosition {
  bottom?: number;
  left: number;
  top?: number;
}

const REACTION_CATALOG = [
  { id: "good-move", emoji: "👍", label: "Хороший ход" },
  { id: "bravo", emoji: "👏", label: "Браво" },
  { id: "wow", emoji: "😮", label: "Вот это да" },
  { id: "nice", emoji: "😄", label: "Красиво" },
  { id: "lucky", emoji: "😅", label: "Повезло" },
  { id: "fire", emoji: "🔥", label: "Огонь" },
] as const satisfies readonly {
  id: RoomReactionId;
  emoji: string;
  label: string;
}[];

const REACTIONS_BY_ID = new Map(
  REACTION_CATALOG.map((reaction) => [reaction.id, reaction] as const),
);

export function RoomReactions() {
  const { connected, reconnectState, isSpectator, snapshot, roomReactions, sendReaction } =
    usePlatform();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const cooldownActiveRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = useId();

  const viewerSeatId = snapshot?.viewer.role === "player" ? snapshot.viewer.seatId : null;
  const viewerSeat = viewerSeatId
    ? snapshot?.seats.find((seat) => seat.seatId === viewerSeatId)
    : undefined;
  const eligible =
    connected &&
    reconnectState === "connected" &&
    !isSpectator &&
    snapshot?.viewer.role === "player" &&
    viewerSeat?.occupantKind === "human" &&
    viewerSeat.controllerKind === "human" &&
    viewerSeat.connected &&
    !viewerSeat.temporaryBot &&
    !viewerSeat.closed;

  useEffect(() => {
    if (!eligible) setPopoverOpen(false);
  }, [eligible]);

  useLayoutEffect(() => {
    setOverlayRoot(rootRef.current?.closest<HTMLElement>(".command-game-screen") ?? null);
  }, []);

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popoverWidth = Math.min(POPOVER_WIDTH, viewportWidth - POPOVER_MARGIN * 2);
    const maxLeft = Math.max(POPOVER_MARGIN, viewportWidth - popoverWidth - POPOVER_MARGIN);
    const left = Math.min(Math.max(POPOVER_MARGIN, triggerRect.right - popoverWidth), maxLeft);
    const openAbove =
      Boolean(trigger.closest(".game-dock-tools")) ||
      triggerRect.bottom + POPOVER_GAP + POPOVER_HEIGHT > viewportHeight - POPOVER_MARGIN;

    setPopoverPosition(
      openAbove
        ? {
            bottom: Math.max(POPOVER_MARGIN, viewportHeight - triggerRect.top + POPOVER_GAP),
            left,
          }
        : { left, top: triggerRect.bottom + POPOVER_GAP },
    );
  }, []);

  useLayoutEffect(() => {
    if (!popoverOpen) {
      setPopoverPosition(null);
      return;
    }

    updatePopoverPosition();
    const visualViewport = window.visualViewport;
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    visualViewport?.addEventListener("resize", updatePopoverPosition);
    visualViewport?.addEventListener("scroll", updatePopoverPosition);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
      visualViewport?.removeEventListener("resize", updatePopoverPosition);
      visualViewport?.removeEventListener("scroll", updatePopoverPosition);
    };
  }, [popoverOpen, updatePopoverPosition]);

  useEffect(() => {
    if (!popoverOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target) &&
        !popoverRef.current?.contains(event.target)
      ) {
        setPopoverOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPopoverOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [popoverOpen]);

  useEffect(
    () => () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    },
    [],
  );

  const chooseReaction = (reactionId: RoomReactionId) => {
    if (!eligible || cooldownActiveRef.current || !sendReaction(reactionId)) return;

    cooldownActiveRef.current = true;
    setCooldownActive(true);
    setPopoverOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      cooldownTimerRef.current = null;
      cooldownActiveRef.current = false;
      setCooldownActive(false);
    }, LOCAL_COOLDOWN_MS);
  };

  const liveRegion = (
    <div
      className="room-reactions-live"
      aria-live="polite"
      aria-relevant="additions"
      aria-atomic="false"
    >
      {roomReactions.map((event) => {
        const reaction = REACTIONS_BY_ID.get(event.reactionId);
        if (!reaction) return null;

        return (
          <div className="room-reaction-message" key={event.eventId}>
            <span className="room-reaction-message-emoji" aria-hidden="true">
              {reaction.emoji}
            </span>
            <span className="room-reaction-message-copy">
              <strong>{event.senderName}</strong>
              <span>{reaction.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );

  const popover = popoverOpen && popoverPosition && (
    <div
      ref={popoverRef}
      id={popoverId}
      className="room-reactions-popover"
      role="group"
      aria-label="Быстрые реакции"
      style={{
        position: "fixed",
        top: popoverPosition.top ?? "auto",
        right: "auto",
        bottom: popoverPosition.bottom ?? "auto",
        left: popoverPosition.left,
      }}
    >
      {REACTION_CATALOG.map((reaction) => (
        <button
          type="button"
          className="room-reactions-option"
          key={reaction.id}
          aria-label={`${reaction.emoji} ${reaction.label}`}
          onClick={() => chooseReaction(reaction.id)}
        >
          <span className="room-reactions-option-emoji" aria-hidden="true">
            {reaction.emoji}
          </span>
          <span className="room-reactions-option-label">{reaction.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="room-reactions" ref={rootRef}>
      {eligible && (
        <button
          ref={triggerRef}
          type="button"
          className="room-reactions-trigger"
          aria-label="Отправить реакцию"
          aria-expanded={popoverOpen}
          aria-controls={popoverId}
          aria-disabled={cooldownActive}
          onClick={() => {
            if (!cooldownActive) setPopoverOpen((current) => !current);
          }}
        >
          <FiSmile aria-hidden="true" focusable="false" />
        </button>
      )}

      {popover && (overlayRoot ? createPortal(popover, overlayRoot) : popover)}
      {overlayRoot ? createPortal(liveRegion, overlayRoot) : liveRegion}
    </div>
  );
}
