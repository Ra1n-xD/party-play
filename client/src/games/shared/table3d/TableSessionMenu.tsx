import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { AccessibleModal } from "../../../platform/components/AccessibleModal";
import { GameRulesModal } from "../../../platform/components/GameRulesModal";
import { usePlatform } from "../../../platform/context/PlatformContext";
import { clientGameRegistry, type RegisteredClientGameId } from "../../../platform/gameRegistry";
import type { RoundTableScene, TablePerformance } from "./RoundTableScene";
import { isTableInputBlocked } from "./TableLookControls";

export interface TableMenuHandle {
  open: (error?: string, nativeEscape?: boolean) => void;
}
export interface TableMenuAction {
  label: string;
  key: string;
  onSelect: () => void;
}
interface Props {
  scene: RefObject<RoundTableScene | null>;
  gameId: RegisteredClientGameId;
  onClassic: () => void;
  actions?: TableMenuAction[];
  people: { id: string; name: string; detail: string }[];
}
type Page = "main" | "rules" | "people" | "performance" | "leave" | null;

export const TableSessionMenu = forwardRef<TableMenuHandle, Props>(function TableSessionMenu(
  { scene, gameId, onClassic, actions = [], people },
  ref,
) {
  const { leaveRoom, snapshot } = usePlatform();
  const [page, setPage] = useState<Page>(null);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<TablePerformance | null>(null);
  const [showFps, setShowFps] = useState(false);
  const buttons = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);
  const game = clientGameRegistry[gameId];
  const open = useCallback(
    (message?: string, nativeEscape = false) => {
      openedAt.current = nativeEscape ? performance.now() : 0;
      scene.current?.releaseLook();
      setError(message ?? null);
      setPage("main");
    },
    [scene],
  );
  useImperativeHandle(ref, () => ({ open }), [open]);
  useEffect(() => {
    const releaseEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") openedAt.current = 0;
    };
    document.addEventListener("keyup", releaseEscape, true);
    return () => document.removeEventListener("keyup", releaseEscape, true);
  }, []);
  const resume = (capture = true) => {
    // Arm gameplay before modal cleanup restores focus to the canvas. Otherwise its
    // focus listener can reopen the menu during the same Escape event.
    scene.current?.resumeLook(false);
    flushSync(() => {
      setPage(null);
      setError(null);
    });
    scene.current?.resumeLook(capture);
  };
  const runAction = (action: () => void) => {
    scene.current?.resumeLook(false);
    flushSync(() => {
      setPage(null);
      action();
    });
    // The external dialog now owns the mouse. Arm a direct return to the game
    // when it closes, instead of opening the session menu again.
    scene.current?.resumeLook(false);
  };
  const dismiss = () => {
    // Native pointer-lock loss can open this dialog before the same Esc reaches the page.
    if (openedAt.current && performance.now() - openedAt.current < 160) return;
    resume(false);
  };
  const requestLeave = () => {
    if (snapshot?.viewer.role === "player") setPage("leave");
    else leaveRoom();
  };
  useEffect(() => {
    if (page !== "performance") return;
    const update = () => {
      setMetrics(scene.current?.getPerformance() ?? null);
      setShowFps(scene.current?.isPerformanceVisible ?? false);
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [page, scene]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey)
        return;
      if (!page) {
        if (isTableInputBlocked(event.target)) return;
        if (event.code === "Digit2" || event.code === "Numpad2") onClassic();
        else if (event.code === "KeyP" && gameId !== "bunker") setPage("people");
        else return;
      } else if (
        (page === "rules" && event.code === "KeyL") ||
        (page === "people" && event.code === "KeyP")
      ) {
        resume();
      } else if (page === "main") {
        const action = actions.find((item) => event.code === `Key${item.key}`);
        if (event.code === "Digit2" || event.code === "Numpad2") onClassic();
        else if (event.code === "KeyL") setPage("rules");
        else if (event.code === "KeyX") requestLeave();
        else if (event.code === "KeyR") {
          scene.current?.toggleOverview();
          resume();
        } else if (action) runAction(action.onSelect);
        else if (event.code === "KeyP") setPage("people");
        else if (event.code === "ArrowDown" || event.code === "ArrowUp") {
          const items = Array.from(
            buttons.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
          );
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const step = event.code === "ArrowDown" ? 1 : -1;
          const next =
            index < 0
              ? step > 0
                ? 0
                : items.length - 1
              : (index + step + items.length) % items.length;
          items[next]?.focus();
        } else return;
      } else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!page) return null;
  if (page === "rules")
    return createPortal(
      <GameRulesModal
        gameId={gameId}
        gameTitle={game.metadata.title}
        rules={game.rules}
        onClose={() => resume(false)}
      />,
      document.body,
    );
  return createPortal(
    <AccessibleModal
      key={page}
      labelledBy="table-session-title"
      onClose={() => resume(false)}
      onEscape={page === "main" ? dismiss : () => resume(false)}
      overlayClassName="table3d-menu-overlay"
      panelClassName="table3d-menu-panel party-dialog"
    >
      <span className="table3d-menu-eyebrow">PARTYSIDE · {game.metadata.title}</span>
      <h2 id="table-session-title">
        {page === "leave"
          ? "Выйти из комнаты?"
          : page === "people"
            ? "Участники"
            : page === "performance"
              ? "Диагностика 3D"
              : "Меню игры"}
      </h2>
      {page === "main" && (
        <>
          {error && (
            <p className="table3d-menu-error" role="alert">
              {error}
            </p>
          )}
          <div className="table3d-menu-actions" ref={buttons}>
            <button type="button" className="is-primary" onClick={() => resume()}>
              <span>Продолжить</span>
              <kbd>Enter</kbd>
            </button>
            <button
              type="button"
              onClick={() => {
                scene.current?.toggleOverview();
                resume();
              }}
            >
              <span>Переключить вид сверху</span>
              <kbd>R</kbd>
            </button>
            <button type="button" onClick={onClassic}>
              <span>Перейти в 2D</span>
              <kbd>2</kbd>
            </button>
            <button type="button" onClick={() => setPage("rules")}>
              <span>Правила игры</span>
              <kbd>L</kbd>
            </button>
            {!actions.some((action) => action.key === "P") && (
              <button type="button" onClick={() => setPage("people")}>
                <span>Участники</span>
                <kbd>P</kbd>
              </button>
            )}
            {actions.map((action) => (
              <button key={action.key} type="button" onClick={() => runAction(action.onSelect)}>
                <span>{action.label}</span>
                <kbd>{action.key}</kbd>
              </button>
            ))}
            <button type="button" onClick={() => setPage("performance")}>
              <span>Диагностика 3D</span>
            </button>
            <button type="button" className="is-danger" onClick={requestLeave}>
              <span>Выйти из комнаты</span>
              <kbd>X</kbd>
            </button>
          </div>
          <p className="table3d-menu-help">
            ↑ ↓ или Tab — выбор · Enter — подтвердить · Esc — вернуться в игру
          </p>
        </>
      )}
      {page === "people" && (
        <>
          <ul className="table3d-menu-people">
            {people.map((person) => (
              <li key={person.id}>
                <strong>{person.name}</strong>
                <span>{person.detail}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary" onClick={() => setPage("main")}>
            Назад в меню
          </button>
        </>
      )}
      {page === "performance" && (
        <>
          <p className="table3d-performance-help">
            Если игра дёргается, эти данные помогут найти причину. FPS можно оставить на экране во
            время игры.
          </p>
          <label className="table3d-fps-toggle">
            <input
              type="checkbox"
              checked={showFps}
              onChange={(event) => {
                setShowFps(event.target.checked);
                scene.current?.setPerformanceVisible(event.target.checked);
              }}
            />
            Показывать FPS
          </label>
          {metrics && (
            <dl className="table3d-performance-data">
              <div>
                <dt>Версия</dt>
                <dd>{__APP_VERSION__}</dd>
              </div>
              <div>
                <dt>FPS / лимит</dt>
                <dd>
                  {metrics.fps} / {metrics.fpsLimit}
                </dd>
              </div>
              <div>
                <dt>Подготовка кадра</dt>
                <dd>{metrics.frameMs.toFixed(1)} мс</dd>
              </div>
              <div>
                <dt>Команды отрисовки</dt>
                <dd>{metrics.drawCalls}</dd>
              </div>
              <div>
                <dt>Треугольники</dt>
                <dd>{metrics.triangles.toLocaleString("ru-RU")}</dd>
              </div>
              <div>
                <dt>Разрешение рендера</dt>
                <dd>{metrics.resolution || "Измеряем…"}</dd>
              </div>
              <div>
                <dt>Графический рендерер</dt>
                <dd>{metrics.renderer}</dd>
              </div>
            </dl>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => setPage("main")}>
            Назад в меню
          </button>
        </>
      )}
      {page === "leave" && (
        <>
          <p>После выхода последнего участника комната закроется.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setPage("main")}>
              Остаться
            </button>
            <button type="button" className="btn btn-danger" onClick={leaveRoom}>
              Выйти из комнаты
            </button>
          </div>
        </>
      )}
    </AccessibleModal>,
    document.body,
  );
});
