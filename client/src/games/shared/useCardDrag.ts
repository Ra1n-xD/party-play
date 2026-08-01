import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type CardDragPhase = "dragging" | "settling" | "returning";

export interface CardDragSession<TPayload> {
  payload: TPayload;
  label: string;
  phase: CardDragPhase;
  left: number;
  top: number;
  width: number;
  height: number;
  activeTargetId: string | null;
}

export interface UseCardDragOptions<TPayload> {
  disabled: boolean;
  resetKey: string | number;
  canDrop: (payload: TPayload, targetId: string) => boolean;
  onDrop: (payload: TPayload, targetId: string) => void;
}

export interface CardDragSourceBindings {
  "data-card-drag-source": "";
  className: "card-motion-shell is-draggable";
  draggable: false;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
}

interface DragCandidate<TPayload> {
  payload: TPayload;
  label: string;
  source: HTMLElement;
  sourceRect: DOMRect;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  grabRatioX: number;
  grabRatioY: number;
  currentX: number;
  currentY: number;
  dragging: boolean;
}

const MOUSE_OR_PEN_DRAG_THRESHOLD = 6;
const TOUCH_VERTICAL_DRAG_THRESHOLD = 10;
const SETTLE_DURATION_MS = 260;
export const CARD_DRAG_SOURCE_CLASS_NAME = "card-motion-shell is-draggable" as const;

function rectToSession<TPayload>(
  candidate: DragCandidate<TPayload>,
  rect: DOMRect,
  phase: CardDragPhase,
  activeTargetId: string | null,
): CardDragSession<TPayload> {
  return {
    payload: candidate.payload,
    label: candidate.label,
    phase,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    activeTargetId,
  };
}

function centeredOnTargetSession<TPayload>(
  candidate: DragCandidate<TPayload>,
  targetRect: DOMRect,
  targetId: string,
): CardDragSession<TPayload> {
  const { sourceRect } = candidate;

  return {
    ...rectToSession(candidate, sourceRect, "settling", targetId),
    left: targetRect.left + (targetRect.width - sourceRect.width) / 2,
    top: targetRect.top + (targetRect.height - sourceRect.height) / 2,
  };
}

export function useCardDrag<TPayload>(options: UseCardDragOptions<TPayload>) {
  const [session, setSession] = useState<CardDragSession<TPayload> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const candidateRef = useRef<DragCandidate<TPayload> | null>(null);
  const clearListenersRef = useRef<(() => void) | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const clickSuppressionRef = useRef<HTMLElement | null>(null);
  const clickSuppressionTimerRef = useRef<number | null>(null);
  const clearClickCompletionRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  const previousResetKeyRef = useRef(options.resetKey);

  optionsRef.current = options;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const clearClickCompletion = useCallback(() => {
    clearClickCompletionRef.current?.();
    clearClickCompletionRef.current = null;
  }, []);

  const clearClickSuppression = useCallback(() => {
    if (clickSuppressionTimerRef.current !== null) {
      window.clearTimeout(clickSuppressionTimerRef.current);
      clickSuppressionTimerRef.current = null;
    }

    clearClickCompletion();
    clickSuppressionRef.current = null;
  }, [clearClickCompletion]);

  const expireClickSuppression = useCallback(() => {
    if (!clickSuppressionRef.current) return;

    clearClickCompletion();

    if (clickSuppressionTimerRef.current !== null) {
      window.clearTimeout(clickSuppressionTimerRef.current);
    }

    clickSuppressionTimerRef.current = window.setTimeout(() => {
      clickSuppressionTimerRef.current = null;
      clickSuppressionRef.current = null;
    }, 0);
  }, [clearClickCompletion]);

  const preserveClickSuppressionUntilPointerUp = useCallback(
    (candidate: DragCandidate<TPayload>) => {
      clearClickCompletion();

      const handlePointerUp = (event: PointerEvent) => {
        if (event.pointerId !== candidate.pointerId) return;

        clearClickCompletion();
        expireClickSuppression();
      };

      const handlePointerCancel = (event: PointerEvent) => {
        if (event.pointerId === candidate.pointerId) {
          clearClickSuppression();
        }
      };

      const handleWindowBlur = () => {
        clearClickSuppression();
      };

      const handleVisibilityChange = () => {
        if (document.hidden) {
          clearClickSuppression();
        }
      };

      clearClickCompletionRef.current = () => {
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
        window.removeEventListener("blur", handleWindowBlur);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
      window.addEventListener("blur", handleWindowBlur);
      document.addEventListener("visibilitychange", handleVisibilityChange);
    },
    [clearClickCompletion, clearClickSuppression, expireClickSuppression],
  );

  const clearSettlingPreview = useCallback(() => {
    clearSettleTimer();
    setSession(null);
  }, [clearSettleTimer]);

  const clearInteraction = useCallback(() => {
    const candidate = candidateRef.current;
    clearListenersRef.current?.();
    clearListenersRef.current = null;

    if (candidate?.source.hasPointerCapture(candidate.pointerId)) {
      candidate.source.releasePointerCapture(candidate.pointerId);
    }

    candidateRef.current = null;
  }, []);

  const cancelActiveDrag = useCallback(
    (preservePotentialClick: boolean) => {
      const candidate = candidateRef.current;
      const wasDragging = candidate?.dragging ?? false;
      clearSettlingPreview();
      clearInteraction();

      if (preservePotentialClick && candidate?.dragging) {
        preserveClickSuppressionUntilPointerUp(candidate);
      } else if (!preservePotentialClick || candidate) {
        clearClickSuppression();
      }

      if (wasDragging) {
        setAnnouncement("Перетаскивание отменено.");
      }
    },
    [
      clearClickSuppression,
      clearInteraction,
      clearSettlingPreview,
      preserveClickSuppressionUntilPointerUp,
    ],
  );

  const cancelDrag = useCallback(() => {
    cancelActiveDrag(true);
  }, [cancelActiveDrag]);

  const cancelDragImmediately = useCallback(() => {
    cancelActiveDrag(false);
  }, [cancelActiveDrag]);

  useEffect(() => {
    const resetChanged = previousResetKeyRef.current !== options.resetKey;

    if (resetChanged || (options.disabled && candidateRef.current)) {
      cancelDrag();
    }

    previousResetKeyRef.current = options.resetKey;
  }, [cancelDrag, options.disabled, options.resetKey]);

  const completedPhase = session?.phase === "dragging" ? null : (session?.phase ?? null);

  useEffect(() => {
    if (!completedPhase) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelDrag();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) cancelDragImmediately();
    };
    const handleViewportChange = () => {
      cancelDragImmediately();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", cancelDragImmediately);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", cancelDragImmediately);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
    };
  }, [cancelDrag, cancelDragImmediately, completedPhase]);

  useEffect(
    () => () => {
      clearSettlingPreview();
      clearInteraction();
      clearClickSuppression();
    },
    [clearClickSuppression, clearInteraction, clearSettlingPreview],
  );

  const bindDragSource = useCallback(
    (payload: TPayload, label: string): CardDragSourceBindings => ({
      "data-card-drag-source": "",
      className: CARD_DRAG_SOURCE_CLASS_NAME,
      draggable: false,
      onDragStart: (event) => event.preventDefault(),
      onPointerDown: (event) => {
        if (
          optionsRef.current.disabled ||
          event.button !== 0 ||
          !event.isPrimary ||
          candidateRef.current
        ) {
          return;
        }

        clearSettlingPreview();
        clearClickSuppression();
        const source = event.currentTarget;
        const sourceRect = source.getBoundingClientRect();
        const candidate: DragCandidate<TPayload> = {
          payload,
          label,
          source,
          sourceRect,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          startX: event.clientX,
          startY: event.clientY,
          grabOffsetX: event.clientX - sourceRect.left,
          grabOffsetY: event.clientY - sourceRect.top,
          grabRatioX:
            sourceRect.width > 0 ? (event.clientX - sourceRect.left) / sourceRect.width : 0.5,
          grabRatioY:
            sourceRect.height > 0 ? (event.clientY - sourceRect.top) / sourceRect.height : 0.5,
          currentX: event.clientX,
          currentY: event.clientY,
          dragging: false,
        };

        const getValidTarget = (clientX: number, clientY: number) => {
          const target = document
            .elementFromPoint(clientX, clientY)
            ?.closest<HTMLElement>("[data-card-drop-target]");
          const targetId = target?.dataset.cardDropTarget?.trim();

          if (!target || !targetId || !optionsRef.current.canDrop(candidate.payload, targetId)) {
            return null;
          }

          return { element: target, id: targetId };
        };

        const abandonCandidate = () => {
          clearInteraction();
        };

        const finishWithPreview = (
          nextSession: CardDragSession<TPayload>,
          nextAnnouncement: string,
        ) => {
          clearInteraction();
          clearSettlingPreview();
          setSession(nextSession);
          setAnnouncement(nextAnnouncement);
          settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null;
            setSession(null);
          }, SETTLE_DURATION_MS);
        };

        const handlePointerMove = (moveEvent: PointerEvent) => {
          if (moveEvent.pointerId !== candidate.pointerId) return;

          candidate.currentX = moveEvent.clientX;
          candidate.currentY = moveEvent.clientY;

          if (!candidate.dragging) {
            const horizontalDistance = Math.abs(moveEvent.clientX - candidate.startX);
            const verticalDistance = Math.abs(moveEvent.clientY - candidate.startY);

            if (candidate.pointerType === "touch") {
              if (Math.max(horizontalDistance, verticalDistance) < TOUCH_VERTICAL_DRAG_THRESHOLD) {
                return;
              }

              if (horizontalDistance > verticalDistance) {
                abandonCandidate();
                return;
              }

              if (
                verticalDistance < TOUCH_VERTICAL_DRAG_THRESHOLD ||
                verticalDistance <= horizontalDistance
              ) {
                return;
              }
            } else if (
              Math.hypot(horizontalDistance, verticalDistance) < MOUSE_OR_PEN_DRAG_THRESHOLD
            ) {
              return;
            }

            candidate.dragging = true;
            clickSuppressionRef.current = source;
            source.setPointerCapture(candidate.pointerId);
            const target = getValidTarget(moveEvent.clientX, moveEvent.clientY);
            setSession({
              ...rectToSession(candidate, candidate.sourceRect, "dragging", target?.id ?? null),
              left: moveEvent.clientX - candidate.grabOffsetX,
              top: moveEvent.clientY - candidate.grabOffsetY,
            });
            setAnnouncement(`Перетаскивание: ${candidate.label}.`);
          }

          moveEvent.preventDefault();
          const target = getValidTarget(moveEvent.clientX, moveEvent.clientY);
          setSession((currentSession) =>
            currentSession
              ? {
                  ...currentSession,
                  left: moveEvent.clientX - candidate.grabOffsetX,
                  top: moveEvent.clientY - candidate.grabOffsetY,
                  activeTargetId: target?.id ?? null,
                }
              : currentSession,
          );
        };

        const handleViewportChange = () => {
          if (candidateRef.current !== candidate) return;

          if (!candidate.dragging || !candidate.source.isConnected) {
            cancelDragImmediately();
            return;
          }

          const nextSourceRect = candidate.source.getBoundingClientRect();
          candidate.sourceRect = nextSourceRect;
          candidate.grabOffsetX = nextSourceRect.width * candidate.grabRatioX;
          candidate.grabOffsetY = nextSourceRect.height * candidate.grabRatioY;
          const target = getValidTarget(candidate.currentX, candidate.currentY);

          setSession((currentSession) =>
            currentSession?.phase === "dragging"
              ? {
                  ...currentSession,
                  left: candidate.currentX - candidate.grabOffsetX,
                  top: candidate.currentY - candidate.grabOffsetY,
                  width: nextSourceRect.width,
                  height: nextSourceRect.height,
                  activeTargetId: target?.id ?? null,
                }
              : currentSession,
          );
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
          if (upEvent.pointerId !== candidate.pointerId) return;

          if (!candidate.dragging) {
            abandonCandidate();
            return;
          }

          const target = getValidTarget(upEvent.clientX, upEvent.clientY);

          if (target) {
            const targetRect = target.element.getBoundingClientRect();
            optionsRef.current.onDrop(candidate.payload, target.id);
            finishWithPreview(
              centeredOnTargetSession(candidate, targetRect, target.id),
              `Карта «${candidate.label}» перемещена.`,
            );
            expireClickSuppression();
            return;
          }

          finishWithPreview(
            rectToSession(candidate, candidate.sourceRect, "returning", null),
            `Перетаскивание карты «${candidate.label}» отменено.`,
          );
          expireClickSuppression();
        };

        const handlePointerCancel = (cancelEvent: PointerEvent) => {
          if (cancelEvent.pointerId === candidate.pointerId) {
            cancelDragImmediately();
          }
        };

        const handleKeyDown = (keyEvent: KeyboardEvent) => {
          if (keyEvent.key === "Escape") {
            cancelDrag();
          }
        };

        const handleVisibilityChange = () => {
          if (document.hidden) {
            cancelDragImmediately();
          }
        };

        const handleWindowBlur = () => {
          cancelDragImmediately();
        };

        clearListenersRef.current = () => {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerUp);
          window.removeEventListener("pointercancel", handlePointerCancel);
          window.removeEventListener("blur", handleWindowBlur);
          document.removeEventListener("keydown", handleKeyDown);
          document.removeEventListener("visibilitychange", handleVisibilityChange);
          window.removeEventListener("scroll", handleViewportChange, true);
          window.removeEventListener("resize", handleViewportChange);
          window.visualViewport?.removeEventListener("scroll", handleViewportChange);
          window.visualViewport?.removeEventListener("resize", handleViewportChange);
        };
        window.addEventListener("pointermove", handlePointerMove, { passive: false });
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerCancel);
        window.addEventListener("blur", handleWindowBlur);
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("scroll", handleViewportChange, true);
        window.addEventListener("resize", handleViewportChange);
        window.visualViewport?.addEventListener("scroll", handleViewportChange);
        window.visualViewport?.addEventListener("resize", handleViewportChange);
        candidateRef.current = candidate;
      },
      onClickCapture: (event) => {
        if (clickSuppressionRef.current !== event.currentTarget) return;

        clearClickSuppression();
        event.preventDefault();
        event.stopPropagation();
      },
    }),
    [
      cancelDrag,
      cancelDragImmediately,
      clearClickSuppression,
      clearInteraction,
      clearSettlingPreview,
      expireClickSuppression,
    ],
  );

  return {
    session,
    announcement,
    bindDragSource,
    isDragging: session?.phase === "dragging",
    activeTargetId: session?.activeTargetId ?? null,
    cancelDrag,
  };
}
