import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiSmile } from "react-icons/fi";
import type { RoomReactionId } from "../../../../shared/platform/reactions";
import { usePlatform } from "../context/PlatformContext";

const LOCAL_COOLDOWN_MS = 1_200;

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
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (!popoverOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
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

  return (
    <div className="room-reactions" ref={rootRef}>
      {eligible && (
        <>
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

          {popoverOpen && (
            <div
              id={popoverId}
              className="room-reactions-popover"
              role="group"
              aria-label="Быстрые реакции"
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
          )}
        </>
      )}

      {overlayRoot ? createPortal(liveRegion, overlayRoot) : liveRegion}
    </div>
  );
}
