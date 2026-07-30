import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CardDragSession } from "./useCardDrag";
import "./card-motion.css";

export interface CardDragLayerProps<TPayload> {
  session: CardDragSession<TPayload> | null;
  announcement: string;
  renderPreview: (payload: TPayload) => ReactNode;
}

interface PreviewBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const DEFAULT_PREVIEW_BOUNDS: PreviewBounds = {
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
};
const VIEWPORT_INSET_PX = 4;

function equalPreviewBounds(current: PreviewBounds | null, next: PreviewBounds): boolean {
  if (!current) return false;

  return (
    Math.abs(current.left - next.left) < 0.5 &&
    Math.abs(current.top - next.top) < 0.5 &&
    Math.abs(current.right - next.right) < 0.5 &&
    Math.abs(current.bottom - next.bottom) < 0.5
  );
}

function clampLayerPosition(
  position: number,
  previewStart: number,
  previewEnd: number,
  viewportStart: number,
  viewportEnd: number,
): number {
  const previewSize = previewEnd - previewStart;
  const viewportSize = viewportEnd - viewportStart;

  if (previewSize >= viewportSize) {
    return viewportStart - previewStart;
  }

  return Math.min(Math.max(position, viewportStart - previewStart), viewportEnd - previewEnd);
}

export function CardDragLayer<TPayload>({
  session,
  announcement,
  renderPreview,
}: CardDragLayerProps<TPayload>) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [previewBounds, setPreviewBounds] = useState<PreviewBounds | null>(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const preview = layer?.querySelector<HTMLElement>(".card-drag-preview");
    if (!layer || !preview || !session) {
      setPreviewBounds(null);
      return;
    }

    const layerRect = layer.getBoundingClientRect();
    const previewElements = [preview, ...preview.querySelectorAll<HTMLElement>("*")];
    let left = layerRect.left;
    let top = layerRect.top;
    let right = layerRect.right;
    let bottom = layerRect.bottom;

    previewElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    });

    const nextBounds = {
      left: left - layerRect.left - VIEWPORT_INSET_PX,
      top: top - layerRect.top - VIEWPORT_INSET_PX,
      right: right - layerRect.left + VIEWPORT_INSET_PX,
      bottom: bottom - layerRect.top + VIEWPORT_INSET_PX,
    };
    setPreviewBounds((current) => (equalPreviewBounds(current, nextBounds) ? current : nextBounds));
  }, [session]);

  const markPreviewInert = (element: HTMLDivElement | null) => {
    layerRef.current = element;
    element?.setAttribute("inert", "");
  };
  const browserWindow = typeof window === "undefined" ? null : window;
  const visualViewport = browserWindow?.visualViewport;
  const viewportLeft = visualViewport?.offsetLeft ?? 0;
  const viewportTop = visualViewport?.offsetTop ?? 0;
  const viewportRight = viewportLeft + (visualViewport?.width ?? browserWindow?.innerWidth ?? 0);
  const viewportBottom = viewportTop + (visualViewport?.height ?? browserWindow?.innerHeight ?? 0);
  const effectiveBounds = session
    ? (previewBounds ?? {
        ...DEFAULT_PREVIEW_BOUNDS,
        right: session.width,
        bottom: session.height,
      })
    : DEFAULT_PREVIEW_BOUNDS;
  const clampedLeft = session
    ? clampLayerPosition(
        session.left,
        effectiveBounds.left,
        effectiveBounds.right,
        viewportLeft,
        viewportRight,
      )
    : 0;
  const clampedTop = session
    ? clampLayerPosition(
        session.top,
        effectiveBounds.top,
        effectiveBounds.bottom,
        viewportTop,
        viewportBottom,
      )
    : 0;

  return (
    <>
      {session ? (
        <div
          className={`card-drag-layer is-${session.phase}`}
          style={{
            width: session.width,
            height: session.height,
            transform: `translate3d(${clampedLeft}px, ${clampedTop}px, 0)`,
          }}
          aria-hidden="true"
          ref={markPreviewInert}
        >
          <div className="card-drag-preview">{renderPreview(session.payload)}</div>
        </div>
      ) : null}
      <div
        className="card-drag-visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
    </>
  );
}
