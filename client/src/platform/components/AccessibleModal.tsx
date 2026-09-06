import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface AccessibleModalProps {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  overlayClassName?: string;
  panelClassName?: string;
}

interface ModalLayer {
  overlay: HTMLElement;
  panel: HTMLElement;
}

const modalLayers: ModalLayer[] = [];
const originalInertStates = new Map<HTMLElement, boolean>();
let originalBodyOverflow: string | null = null;

function syncModalLayers(): void {
  for (const [element, wasInert] of originalInertStates) {
    element.toggleAttribute("inert", wasInert);
  }
  originalInertStates.clear();

  const topLayer = modalLayers.at(-1);
  if (!topLayer) {
    if (originalBodyOverflow !== null) document.body.style.overflow = originalBodyOverflow;
    originalBodyOverflow = null;
    return;
  }

  originalBodyOverflow ??= document.body.style.overflow;
  let currentLayer: HTMLElement | null = topLayer.overlay;
  while (currentLayer && currentLayer !== document.body) {
    const parent: HTMLElement | null = currentLayer.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === currentLayer) continue;
      originalInertStates.set(sibling, sibling.hasAttribute("inert"));
      sibling.setAttribute("inert", "");
    }
    currentLayer = parent;
  }
  document.body.style.overflow = "hidden";
}

function getFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

export function AccessibleModal({
  labelledBy,
  onClose,
  children,
  overlayClassName = "",
  panelClassName = "",
}: AccessibleModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layer = { overlay, panel };
    modalLayers.push(layer);
    syncModalLayers();

    const focusFrame = requestAnimationFrame(() => {
      if (modalLayers.at(-1) !== layer) return;
      const [firstFocusable] = getFocusableElements(panel);
      (firstFocusable ?? panel).focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalLayers.at(-1) !== layer) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements = getFocusableElements(panel);
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === firstFocusable || !panel.contains(activeElement))) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      const wasTopLayer = modalLayers.at(-1) === layer;
      modalLayers.splice(modalLayers.indexOf(layer), 1);
      syncModalLayers();
      if (!wasTopLayer) return;
      const topLayer = modalLayers.at(-1);
      if (
        previousActiveElement?.isConnected &&
        !previousActiveElement.closest("[inert]") &&
        (!topLayer || topLayer.panel.contains(previousActiveElement))
      ) {
        previousActiveElement.focus({ preventScroll: true });
      } else if (topLayer) {
        const [firstFocusable] = getFocusableElements(topLayer.panel);
        (firstFocusable ?? topLayer.panel).focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className={`modal-overlay ${overlayClassName}`.trim()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <section
        ref={panelRef}
        className={`modal ${panelClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
