import {
  AVATAR_PITCH_MAX,
  AVATAR_PITCH_MIN,
  AVATAR_YAW_LIMIT,
  type AvatarLook,
} from "../../../../../shared/platform/avatarLook";

export const TABLE_DEFAULT_PITCH = -0.36;

export function isTableInputBlocked(target: EventTarget | null): boolean {
  return Boolean(
    document.querySelector('[aria-modal="true"], [role="dialog"], [data-table-input-block]') ||
    (target instanceof HTMLElement &&
      target.closest('input, textarea, select, [contenteditable="true"]')),
  );
}

/** Desktop play requires pointer lock; losing it returns to the keyboard-accessible menu. */
export class TableLookControls {
  readonly target: AvatarLook = { yaw: 0, pitch: TABLE_DEFAULT_PITCH };
  private readonly abort = new AbortController();
  private readonly coarse = window.matchMedia("(pointer: coarse)");
  private cursorVisible = true;
  private touch: { id: number; x: number; y: number } | null = null;
  private readonly modalObserver: MutationObserver;
  private requestPending = false;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onCursor: (visible: boolean) => void,
    private readonly onMenu: (error?: string) => void,
    private readonly onOverview: () => void,
    defaultPitch = TABLE_DEFAULT_PITCH,
  ) {
    this.target.pitch = defaultPitch;
    const options = { signal: this.abort.signal };
    this.onCursor(true);
    document.addEventListener(
      "mousemove",
      (event) => {
        if (document.pointerLockElement !== canvas || isTableInputBlocked(event.target)) return;
        this.move(event.movementX, event.movementY);
      },
      options,
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.defaultPrevented ||
          event.repeat ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          isTableInputBlocked(event.target)
        )
          return;
        if (event.code === "Escape") {
          event.preventDefault();
          this.release();
          this.onMenu();
        } else if (event.code === "KeyR") {
          event.preventDefault();
          this.onOverview();
        }
      },
      options,
    );
    document.addEventListener(
      "pointerlockchange",
      () => {
        this.requestPending = false;
        if (document.pointerLockElement === canvas) canvas.focus({ preventScroll: true });
        this.syncCursor();
      },
      options,
    );
    document.addEventListener("pointerlockerror", () => this.captureFailed(), options);
    window.addEventListener(
      "blur",
      () => {
        this.release();
        if (!this.coarse.matches && !isTableInputBlocked(null)) this.onMenu();
      },
      options,
    );
    const syncCursor = () => this.syncCursor();
    window.addEventListener("focus", syncCursor, options);
    document.addEventListener("visibilitychange", syncCursor, options);
    this.coarse.addEventListener("change", syncCursor, options);
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
      attributeFilter: ["aria-modal", "role", "data-table-input-block"],
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

  /** Call synchronously from a trusted click/key, after removing the menu. */
  resume() {
    if (this.disposed) return;
    if (this.coarse.matches) {
      this.canvas.focus({ preventScroll: true });
      return;
    }
    if (document.pointerLockElement === this.canvas || this.requestPending) return;
    if (!this.canvas.requestPointerLock) {
      this.onMenu("Захват мыши недоступен в этом браузере. Можно продолжить партию в 2D.");
      return;
    }
    this.requestPending = true;
    this.canvas.focus({ preventScroll: true });
    try {
      const request = this.canvas.requestPointerLock();
      if (request) void request.catch((error: unknown) => this.captureFailed(error));
    } catch (error) {
      this.captureFailed(error);
    }
  }

  release() {
    this.touch = null;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.setCursor(true);
  }

  private captureFailed(error?: unknown) {
    if (this.disposed) return;
    if (error && import.meta.env.DEV) console.debug("3D mouse capture was denied", error);
    this.requestPending = false;
    this.setCursor(true);
    this.onMenu("Не удалось захватить мышь. Нажмите Enter или «Продолжить» ещё раз.");
  }

  private setCursor(visible: boolean) {
    if (this.cursorVisible === visible) return;
    this.cursorVisible = visible;
    this.onCursor(visible);
  }

  private syncCursor() {
    if (this.disposed) return;
    const blocked = isTableInputBlocked(document.activeElement);
    // Keyboard dialogs suspend camera motion but retain capture. Esc/the main menu releases it.
    if (document.hidden || !document.hasFocus()) this.release();
    else this.setCursor(document.pointerLockElement !== this.canvas);
    if (!this.coarse.matches && this.cursorVisible && !blocked && !this.requestPending)
      this.onMenu();
  }

  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.modalObserver.disconnect();
    this.release();
  }
}
