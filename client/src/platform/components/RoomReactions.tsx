import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ROOM_REACTIONS,
  ownsRoomReaction,
  type RoomReactionId,
} from "../../../../shared/platform/reactions";
import { usePlatform } from "../context/PlatformContext";
import { useProfile } from "../context/ProfileContext";
import { useReactionAudio } from "../useReactionAudio";
import { ReactionIcon } from "./ReactionIcon";
import "../../styles/reactions.css";

const LOCAL_COOLDOWN_MS = 1_200;
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 390;
const POPOVER_MARGIN = 12;
const POPOVER_GAP = 9;

interface PopoverPosition {
  bottom?: number;
  left: number;
  maxHeight: number;
  top?: number;
}

const REACTIONS_BY_ID = new Map(ROOM_REACTIONS.map((reaction) => [reaction.id, reaction] as const));

export function RoomReactions() {
  const { connected, reconnectState, isSpectator, snapshot, roomReactions, sendReaction } =
    usePlatform();
  const { profile } = useProfile();
  const availableReactions = useMemo(
    () => ROOM_REACTIONS.filter((reaction) => ownsRoomReaction(reaction.id, profile?.inventory)),
    [profile?.inventory],
  );
  const sound = useReactionAudio(roomReactions, !connected || Boolean(snapshot?.pause.active));
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

  const restoreFocus = useCallback(() => {
    requestAnimationFrame(() => {
      const table = rootRef.current?.closest(".is-3d")?.querySelector<HTMLCanvasElement>("canvas");
      // Return Space/Enter to the game after choosing an emotion in 3D.
      (table ?? triggerRef.current)?.focus({ preventScroll: true });
    });
  }, []);

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
    if (!triggerRect.width && trigger.closest(".is-3d")) {
      setPopoverPosition({
        bottom: 24,
        left: Math.max(12, viewportWidth - popoverWidth - 24),
        maxHeight: viewportHeight - 24 - POPOVER_MARGIN,
      });
      return;
    }
    const maxLeft = Math.max(POPOVER_MARGIN, viewportWidth - popoverWidth - POPOVER_MARGIN);
    const left = Math.min(Math.max(POPOVER_MARGIN, triggerRect.right - popoverWidth), maxLeft);
    const spaceAbove = Math.max(0, triggerRect.top - POPOVER_GAP - POPOVER_MARGIN);
    const spaceBelow = Math.max(
      0,
      viewportHeight - triggerRect.bottom - POPOVER_GAP - POPOVER_MARGIN,
    );
    const openAbove = spaceAbove >= POPOVER_HEIGHT || spaceAbove > spaceBelow;

    setPopoverPosition(
      openAbove
        ? {
            bottom: Math.max(POPOVER_MARGIN, viewportHeight - triggerRect.top + POPOVER_GAP),
            left,
            maxHeight: spaceAbove,
          }
        : {
            left,
            top: triggerRect.bottom + POPOVER_GAP,
            maxHeight: spaceBelow,
          },
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
      restoreFocus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [popoverOpen, restoreFocus]);

  useEffect(
    () => () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    },
    [],
  );

  const chooseReaction = useCallback(
    (reactionId: RoomReactionId) => {
      if (
        !eligible ||
        !ownsRoomReaction(reactionId, profile?.inventory) ||
        cooldownActiveRef.current ||
        !sendReaction(reactionId)
      )
        return;

      cooldownActiveRef.current = true;
      setCooldownActive(true);
      setPopoverOpen(false);
      restoreFocus();
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = setTimeout(() => {
        cooldownTimerRef.current = null;
        cooldownActiveRef.current = false;
        setCooldownActive(false);
      }, LOCAL_COOLDOWN_MS);
    },
    [eligible, profile?.inventory, sendReaction, restoreFocus],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !eligible ||
        !rootRef.current?.closest(".is-3d") ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector('[aria-modal="true"], [role="dialog"]') ||
        (event.target instanceof HTMLElement &&
          event.target.closest("input, textarea, select, [contenteditable]"))
      )
        return;
      if (event.code === "KeyV") {
        event.preventDefault();
        if (!cooldownActiveRef.current) {
          setPopoverOpen((open) => !open);
          if (popoverOpen) restoreFocus();
        }
      } else if (popoverOpen && /^(Digit|Numpad)[1-7]$/.test(event.code)) {
        event.preventDefault();
        const reaction = availableReactions[Number(event.code.slice(-1)) - 1];
        if (reaction) chooseReaction(reaction.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [eligible, popoverOpen, chooseReaction, restoreFocus, availableReactions]);

  useEffect(() => {
    if (popoverOpen) popoverRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [popoverOpen, popoverPosition]);

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
            <span className="room-reaction-message-icon" aria-hidden="true">
              <ReactionIcon id={reaction.id} animated />
            </span>
            <span className="room-reaction-message-copy">
              <strong>{event.senderName}</strong>
              <span>{reaction.label}</span>
              {reaction.id === "laugh" && (
                <button
                  type="button"
                  className="room-reaction-sound"
                  onClick={sound.toggle}
                  aria-pressed={sound.enabled}
                >
                  {sound.enabled ? "Выключить звук эмоций" : "Включить звук эмоций"}
                </button>
              )}
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
      data-table-input-block="reactions"
      style={{
        position: "fixed",
        top: popoverPosition.top ?? "auto",
        right: "auto",
        bottom: popoverPosition.bottom ?? "auto",
        left: popoverPosition.left,
        maxHeight: popoverPosition.maxHeight,
      }}
    >
      {availableReactions.map((reaction, index) => (
        <button
          type="button"
          className="room-reactions-option"
          key={reaction.id}
          aria-label={reaction.label}
          onClick={() => chooseReaction(reaction.id)}
        >
          <span className="room-reactions-option-icon" aria-hidden="true">
            <ReactionIcon id={reaction.id} />
          </span>
          <span className="room-reactions-option-label">{reaction.label}</span>
          <kbd className="room-reactions-shortcut">{index + 1}</kbd>
        </button>
      ))}
      <div className="room-reactions-footer">
        {availableReactions.length < ROOM_REACTIONS.length && (
          <span>Другие эмоции открываются в кейсах.</span>
        )}
        <button
          type="button"
          className="room-reaction-sound"
          onClick={sound.toggle}
          aria-pressed={sound.enabled}
        >
          {sound.enabled ? "Звук эмоций включён" : "Звук эмоций выключен"}
        </button>
      </div>
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
          <ReactionIcon id="wow" />
        </button>
      )}

      {popover && (overlayRoot ? createPortal(popover, overlayRoot) : popover)}
      {overlayRoot ? createPortal(liveRegion, overlayRoot) : liveRegion}
    </div>
  );
}
