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

/** Dialogs release the mouse; closing them returns directly to the camera. */
export class TableLookControls {
  readonly target: AvatarLook = { yaw: 0, pitch: TABLE_DEFAULT_PITCH };
  private readonly abort = new AbortController();
  private readonly coarse = window.matchMedia("(pointer: coarse), (max-width: 680px)");
  private cursorVisible = true;
  private touch: { id: number; x: number; y: number } | null = null;
  private readonly modalObserver: MutationObserver;
  private requestPending = false;
  private disposed = false;
  private gameplayActive = false;
  private expectedUnlock = false;
  private inputBlocked = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onCursor: (visible: boolean) => void,
    private readonly onMenu: (error?: string, nativeEscape?: boolean) => void,
    private readonly onOverview: () => void,
    defaultPitch = TABLE_DEFAULT_PITCH,
  ) {
    this.target.pitch = defaultPitch;
    // Touch navigation starts directly at the table and does not need Pointer Lock.
    this.gameplayActive = this.coarse.matches;
    const options = { signal: this.abort.signal };
    this.onCursor(true);
    document.addEventListener(
      "mousemove",
      (event) => {
        // High polling-rate mice can send thousands of events per second. Dialog state is
        // refreshed on DOM/focus changes instead of searching the entire page for each event.
        if (this.coarse.matches || !this.gameplayActive || this.inputBlocked) return;
        // With a visible cursor the pet is a projected button. Hovering it should
        // not move the camera away before the player can click it.
        if (event.target instanceof Element && event.target.closest(".table3d-pet-hit")) return;
        // Esc can temporarily prevent a new Pointer Lock request. Keep the cursor hidden
        // and allow camera motion until the next click/key can capture it again.
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
        if (event.code !== "Escape" && this.gameplayActive) this.resume();
      },
      options,
    );
    document.addEventListener(
      "pointerlockchange",
      () => {
        this.requestPending = false;
        const locked = document.pointerLockElement === canvas;
        if (locked) {
          this.expectedUnlock = false;
          if (!this.inputBlocked) canvas.focus({ preventScroll: true });
        } else if (this.expectedUnlock) {
          this.expectedUnlock = false;
        } else if (this.gameplayActive && !this.inputBlocked) {
          // Native Esc may release Pointer Lock before dispatching the same page keydown.
          this.release();
          this.onMenu(undefined, true);
        }
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
    document.addEventListener("focusin", syncCursor, options);
    document.addEventListener("focusout", syncCursor, options);
    this.coarse.addEventListener("change", syncCursor, options);
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (isTableInputBlocked(event.target)) return;
        if (event.pointerType !== "touch") {
          if (this.gameplayActive) this.resume();
          return;
        }
        this.touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
      },
      options,
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (this.touch?.id !== event.pointerId || this.inputBlocked) return;
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

  get canUseTouchControls() {
    return this.coarse.matches;
  }

  /** Call synchronously from a trusted click/key, after removing the menu. */
  resume(capture = true) {
    if (this.disposed) return;
    this.gameplayActive = true;
    if (isTableInputBlocked(null)) {
      this.inputBlocked = true;
      this.unlock();
      this.setCursor(true);
      return;
    }
    if (this.coarse.matches) {
      this.setCursor(true);
      return;
    }
    this.setCursor(false);
    if (!capture) {
      this.requestPending = false;
      this.canvas.focus({ preventScroll: true });
      return;
    }
    if (document.pointerLockElement === this.canvas || this.requestPending) return;
    if (!this.canvas.requestPointerLock) {
      this.release();
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
    this.gameplayActive = false;
    this.touch = null;
    this.unlock();
    this.setCursor(true);
  }

  private unlock() {
    if (document.pointerLockElement !== this.canvas) return;
    this.expectedUnlock = true;
    document.exitPointerLock();
  }

  private captureFailed(error?: unknown) {
    if (this.disposed) return;
    if (error && import.meta.env.DEV) console.debug("3D mouse capture was denied", error);
    this.requestPending = false;
    // Browser security may deny recapture after Esc. It must not reopen a menu that
    // the player just closed; the next trusted click/key retries capture.
    this.syncCursor();
  }

  private setCursor(visible: boolean) {
    if (this.cursorVisible === visible) return;
    this.cursorVisible = visible;
    this.onCursor(visible);
  }

  private syncCursor() {
    if (this.disposed) return;
    const wasBlocked = this.inputBlocked;
    const blocked = isTableInputBlocked(document.activeElement);
    this.inputBlocked = blocked;
    if (document.hidden || !document.hasFocus()) {
      this.release();
      return;
    }
    if (blocked) {
      this.unlock();
      this.setCursor(true);
      return;
    }
    if (wasBlocked && this.gameplayActive) {
      // Closing with Esc must not immediately recapture, then lose, Pointer Lock.
      this.resume(false);
      return;
    }
    this.setCursor(this.coarse.matches || !this.gameplayActive);
    if (
      !this.coarse.matches &&
      this.cursorVisible &&
      !blocked &&
      !this.requestPending &&
      !this.gameplayActive
    )
      this.onMenu();
  }

  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.modalObserver.disconnect();
    this.release();
  }
}
