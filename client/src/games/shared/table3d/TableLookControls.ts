import {
  AVATAR_PITCH_MAX,
  AVATAR_PITCH_MIN,
  AVATAR_YAW_LIMIT,
  type AvatarLook,
} from "../../../../../shared/platform/avatarLook";

export const TABLE_DEFAULT_PITCH = -0.48;

export function isTableInputBlocked(target: EventTarget | null): boolean {
  return Boolean(
    document.querySelector('[aria-modal="true"], [role="dialog"], [data-table-input-block]') ||
    (target instanceof HTMLElement &&
      target.closest('input, textarea, select, [contenteditable="true"]')),
  );
}

/** Keeps mouse look active; only dialogs, text entry and an inactive window suspend it. */
export class TableLookControls {
  readonly target: AvatarLook = { yaw: 0, pitch: TABLE_DEFAULT_PITCH };
  private readonly abort = new AbortController();
  private cursorVisible = window.matchMedia("(pointer: coarse)").matches;
  private previous: { x: number; y: number } | null = null;
  private touch: { id: number; x: number; y: number } | null = null;
  private readonly root: HTMLElement;
  private readonly modalObserver: MutationObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onCursor: (visible: boolean) => void,
    private readonly defaultPitch = TABLE_DEFAULT_PITCH,
  ) {
    this.target.pitch = defaultPitch;
    this.root = canvas.closest<HTMLElement>(".is-3d") ?? canvas;
    const options = { signal: this.abort.signal };
    this.onCursor(this.cursorVisible);
    const isInterfaceClick = (event: MouseEvent) =>
      event.detail === 0 ||
      (event.target instanceof Element &&
        Boolean(event.target.closest('button, a[href], input, textarea, select, [role="button"]')));
    document.addEventListener(
      "mousemove",
      (event) => {
        if (this.cursorVisible || isTableInputBlocked(event.target)) {
          this.previous = null;
          return;
        }
        if (document.pointerLockElement === canvas) {
          this.move(event.movementX, event.movementY);
        } else if (event.target instanceof Node && this.root.contains(event.target)) {
          if (this.previous)
            this.move(event.clientX - this.previous.x, event.clientY - this.previous.y);
          this.previous = { x: event.clientX, y: event.clientY };
        } else this.previous = null;
      },
      options,
    );
    this.root.addEventListener(
      "mouseleave",
      () => {
        this.previous = null;
      },
      options,
    );
    this.root.addEventListener(
      "dblclick",
      (event) => {
        if (
          this.cursorVisible ||
          isTableInputBlocked(event.target) ||
          isInterfaceClick(event) ||
          window.matchMedia("(pointer: coarse)").matches
        )
          return;
        event.preventDefault();
        event.stopPropagation();
      },
      { ...options, capture: true },
    );
    this.root.addEventListener(
      "click",
      (event) => {
        if (
          this.cursorVisible ||
          isTableInputBlocked(event.target) ||
          isInterfaceClick(event) ||
          window.matchMedia("(pointer: coarse)").matches
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        this.capturePointer();
      },
      { ...options, capture: true },
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.repeat ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          isTableInputBlocked(event.target)
        )
          return;
        if (event.code === "KeyR") {
          event.preventDefault();
          this.target.yaw = 0;
          this.target.pitch = this.defaultPitch;
        }
      },
      options,
    );
    document.addEventListener(
      "pointerlockchange",
      () => {
        this.previous = null;
        this.syncCursor();
      },
      options,
    );
    // Unsupported/denied pointer lock still permits bounded mouse look inside the game.
    document.addEventListener(
      "pointerlockerror",
      () => {
        this.previous = null;
      },
      options,
    );
    const syncCursor = () => this.syncCursor();
    window.addEventListener("blur", syncCursor, options);
    window.addEventListener("focus", syncCursor, options);
    document.addEventListener("visibilitychange", syncCursor, options);
    document.addEventListener("focusin", syncCursor, options);
    document.addEventListener("focusout", syncCursor, options);
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType !== "touch" || isTableInputBlocked(event.target)) return;
        this.touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
      },
      options,
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (this.touch?.id !== event.pointerId || isTableInputBlocked(event.target)) return;
        this.move(event.clientX - this.touch.x, event.clientY - this.touch.y);
        this.touch.x = event.clientX;
        this.touch.y = event.clientY;
      },
      options,
    );
    const releaseTouch = () => {
      this.touch = null;
    };
    canvas.addEventListener("pointerup", releaseTouch, options);
    canvas.addEventListener("pointercancel", releaseTouch, options);
    canvas.addEventListener("lostpointercapture", releaseTouch, options);
    this.modalObserver = new MutationObserver(syncCursor);
    this.modalObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-modal", "role", "data-table-input-block", "contenteditable"],
    });
    this.syncCursor();
  }

  private move(dx: number, dy: number) {
    this.target.yaw = Math.max(
      -AVATAR_YAW_LIMIT,
      Math.min(AVATAR_YAW_LIMIT, this.target.yaw - dx * 0.003),
    );
    this.target.pitch = Math.max(
      AVATAR_PITCH_MIN,
      Math.min(AVATAR_PITCH_MAX, this.target.pitch - dy * 0.0025),
    );
  }

  get isCursorVisible() {
    return this.cursorVisible;
  }

  private capturePointer() {
    this.canvas.focus({ preventScroll: true });
    if (document.pointerLockElement === this.canvas || !this.canvas.requestPointerLock) return;
    try {
      const request = this.canvas.requestPointerLock();
      if (request)
        void request.catch(() => {
          this.previous = null;
        });
    } catch {
      this.previous = null;
    }
  }

  private syncCursor() {
    const visible =
      window.matchMedia("(pointer: coarse)").matches ||
      document.hidden ||
      !document.hasFocus() ||
      isTableInputBlocked(document.activeElement);
    if (this.cursorVisible !== visible) {
      this.cursorVisible = visible;
      this.previous = null;
      this.touch = null;
      this.onCursor(visible);
    }
    if (visible && document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  dispose() {
    this.abort.abort();
    this.modalObserver.disconnect();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.onCursor(true);
  }
}
