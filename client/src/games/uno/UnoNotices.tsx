import { useEffect, useRef, useState } from "react";
import type { UnoPublicState } from "../../../../shared/games/uno/types";

interface Props {
  game: UnoPublicState;
  viewerSeatId: string | null;
  canAct: boolean;
  catchWindowId: number | null;
  revision: number;
  onDeclare: () => void;
  onCatch: () => void;
  onRespond: (decision: "accept" | "challenge") => void;
}

export function UnoNotices({
  game,
  viewerSeatId,
  canAct,
  catchWindowId,
  revision,
  onDeclare,
  onCatch,
  onRespond,
}: Props) {
  const windows = game.unoWindows ?? (game.unoWindow ? [game.unoWindow] : []);
  const declarationWindow =
    windows.find((entry) => entry.subjectSeatId === viewerSeatId) ??
    windows.find((entry) => entry.id === catchWindowId) ??
    windows[0];
  const [remaining, setRemaining] = useState(0);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const seen = useRef<Set<number> | null>(null);
  const name = (id: string) => game.players.find((player) => player.seatId === id)?.name ?? "Игрок";

  useEffect(() => {
    const duration = declarationWindow?.protectedRemainingMs ?? 0;
    const receivedAt = Date.now();
    const update = () =>
      setRemaining(
        Math.max(0, Math.ceil((duration - (game.paused ? 0 : Date.now() - receivedAt)) / 1000)),
      );
    update();
    if (game.paused || !duration) return;
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [declarationWindow?.id, declarationWindow?.protectedRemainingMs, game.paused, revision]);

  useEffect(() => {
    const fresh = seen.current
      ? game.visualEvents.filter((event) => !seen.current!.has(event.id))
      : [];
    seen.current = new Set(game.visualEvents.map((event) => event.id));
    for (const event of fresh) {
      if (event.type !== "action") continue;
      let text: string | null = null;
      if (event.action === "declare-uno") text = `${name(event.seatId)} говорит UNO!`;
      if (event.action === "catch-uno") {
        const transfer = game.visualEvents.find((entry) => entry.id === event.id - 1);
        const subject =
          transfer?.type === "transfer" && transfer.target.kind === "player"
            ? name(transfer.target.seatId)
            : "игрока";
        text = `${name(event.seatId)} поймал ${subject} без UNO · +2 карты`;
      }
      if (event.action === "challenge-draw-four") {
        const resolution = game.lastChallengeResolution;
        const outcome = resolution?.targetSeatId === event.seatId ? resolution.outcome : null;
        text = `${name(event.seatId)} оспорил +4`;
        if (outcome === "challenge-succeeded") text += " · успешно, штраф автору +4";
        if (outcome === "challenge-failed") text += " · неудача, штраф +6";
      }
      if (event.action === "accept-draw-four") text = `${name(event.seatId)} принимает +4 карты`;
      if (text) setNotice({ id: event.id, text });
    }
  }, [game.visualEvents, game.players, game.lastChallengeResolution]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4_400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const pending = game.pendingWildDrawFour;
  const ownResponse = pending?.targetSeatId === viewerSeatId;
  const ownWindow = declarationWindow?.subjectSeatId === viewerSeatId;
  return (
    <div className="uno-notices" aria-label="События UNO">
      {pending && (
        <div
          className={`uno-notice is-challenge${ownResponse ? " is-required" : ""}`}
          role="status"
        >
          <strong>
            {ownResponse ? "Вам сыграли +4" : `${name(pending.sourceSeatId)} сыграл +4`}
          </strong>
          <span>
            {ownResponse
              ? "Примите 4 карты или оспорьте ход"
              : `Решение принимает ${name(pending.targetSeatId)}`}
          </span>
          {ownResponse && (
            <div className="uno-notice-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!canAct}
                onClick={() => onRespond("accept")}
              >
                Принять +4
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={!canAct}
                onClick={() => onRespond("challenge")}
              >
                Оспорить +4
              </button>
            </div>
          )}
        </div>
      )}
      {declarationWindow && (
        <div className={`uno-notice${ownWindow ? " is-required" : ""}`} role="status">
          <strong>
            {ownWindow ? "Скажите UNO!" : `${name(declarationWindow.subjectSeatId)} не сказал UNO`}
          </strong>
          <span>
            {game.paused
              ? "Окно UNO на паузе"
              : declarationWindow.canBeCaught
                ? "Доступна поимка · штраф +2 карты"
                : remaining > 0
                  ? `На объявление UNO: ${remaining} с · или до действия следующего игрока`
                  : "Проверяем возможность поимки…"}
          </span>
          {ownWindow ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canAct}
              onClick={onDeclare}
            >
              Сказать UNO!
            </button>
          ) : (
            declarationWindow.id === catchWindowId && (
              <button type="button" className="btn btn-danger" disabled={!canAct} onClick={onCatch}>
                Поймать без UNO
              </button>
            )
          )}
        </div>
      )}
      {notice && (
        <div className="uno-event-notice" key={notice.id} role="status">
          {notice.text}
        </div>
      )}
    </div>
  );
}
