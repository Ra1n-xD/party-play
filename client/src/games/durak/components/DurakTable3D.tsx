import { useEffect, useRef, useState } from "react";
import type { DurakPublicState } from "../../../../../shared/games/durak/types";
import { RoundTableScene, type RoundTableState } from "../../shared/table3d/RoundTableScene";
import { getDurakCardFace, getSuitSymbol } from "./DurakCard";
import type { TableHandCard } from "../../shared/table3d/FirstPersonHand";

import { useTablePresence } from "../../shared/table3d/useTablePresence";

interface Props {
  game: DurakPublicState;
  isHost: boolean;
  viewerSeatId: string | null;
  targetIds: string[];
  onDefend: (attackCardId: string) => void;
  roomCode: string;
  canSendLook: boolean;
  cursorVisible: boolean;
  onCursorChange: (visible: boolean) => void;
  focusedTargetId: string | null;
  secondaryLabel: string;
  onClassic: () => void;
  paused: boolean;
  revision: number;
  hand: TableHandCard[];
  onFocusCard: (id: string) => void;
  onSelectCard: (id: string) => void;
}

export default function DurakTable3D({
  game,
  isHost,
  viewerSeatId,
  targetIds,
  onDefend,
  onClassic,
  paused,
  revision,
  roomCode,
  canSendLook,
  cursorVisible,
  onCursorChange,
  focusedTargetId,
  secondaryLabel,
  hand,
  onFocusCard,
  onSelectCard,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<RoundTableScene | null>(null);
  const cursorCallback = useRef(onCursorChange);
  cursorCallback.current = onCursorChange;
  const handCallbacks = useRef({ onFocusCard, onSelectCard });
  handCallbacks.current = { onFocusCard, onSelectCard };
  const [failed, setFailed] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 600px)").matches);
  const sendLook = useTablePresence(
    roomCode,
    canSendLook,
    (event) => scene.current?.receiveLook(event),
    (event) => scene.current?.receiveReaction(event),
  );
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!host.current || !labels.current) return;
    try {
      scene.current = new RoundTableScene(
        host.current,
        labels.current,
        sendLook,
        (visible) => cursorCallback.current(visible),
        () => {
          setFailed(true);
          cursorCallback.current(true);
        },
        {
          onFocusHandCard: (id) => handCallbacks.current.onFocusCard(id),
          onSelectHandCard: (id) => handCallbacks.current.onSelectCard(id),
        },
      );
    } catch {
      setFailed(true);
      cursorCallback.current(true);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    if (game.turnRemainingMs === null) {
      setSeconds(null);
      return;
    }
    const end = Date.now() + game.turnRemainingMs;
    const update = () => setSeconds(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    update();
    if (paused) return;
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [game.turnRemainingMs, paused, revision]);

  useEffect(() => {
    scene.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const state: RoundTableState = {
      viewerId: viewerSeatId,
      ownHand: hand,
      people: game.players.map((player) => ({
        id: player.seatId,
        name: player.name,
        count: player.cardCount,
        active: player.isCurrentActor,
        isBot: player.controllerKind === "bot",
        eliminated: player.status !== "active",
        muted: player.status !== "active",
        detail:
          player.status === "out"
            ? "вышел"
            : player.status === "excluded"
              ? "покинул игру"
              : game.takeDeclared && player.isDefender
                ? "берёт"
                : game.passedSeatIds.includes(player.seatId)
                  ? "пас"
                  : player.temporaryBot
                    ? "временный бот"
                    : player.controllerKind === "bot"
                      ? "бот"
                      : !player.connected
                        ? "нет связи"
                        : player.isDefender
                          ? "защищается"
                          : player.isAttacker
                            ? "атакует"
                            : "за столом",
      })),
      cards: game.table.flatMap((pair, index) => {
        const maxColumns = narrow ? 2 : 3;
        const columns = Math.min(game.table.length, maxColumns);
        const rows = Math.ceil(game.table.length / maxColumns);
        const x = ((index % maxColumns) - (columns - 1) / 2) * (narrow ? 0.94 : 1.12) - 0.13;
        const z =
          Math.floor(index / maxColumns) * (narrow ? 1 : 1.12) +
          (narrow ? 0.5 - (rows - 1) * 0.8 : rows > 1 ? -0.25 : 0.5);
        return [
          {
            id: pair.attack.id,
            ...getDurakCardFace(pair.attack),
            x,
            z,
            covered: false,
            sourceId: pair.attackPlayedBySeatId,
            selectable: targetIds.includes(pair.attack.id),
            focused: focusedTargetId === pair.attack.id && targetIds.includes(pair.attack.id),
          },
          ...(pair.defense
            ? [
                {
                  id: pair.defense.id,
                  ...getDurakCardFace(pair.defense),
                  x: x + 0.25,
                  z: z + 0.25,
                  covered: true,
                  sourceId: pair.defensePlayedBySeatId ?? "",
                  selectable: false,
                  focused: false,
                },
              ]
            : []),
        ];
      }),
      deckCount: game.deckCount,
      discardCount: game.discardCount,
      trump:
        game.trumpCard && game.trumpCardLocation === "deck"
          ? getDurakCardFace(game.trumpCard)
          : null,
      takeSeatId: null,
    };
    const resolution = [...game.visualEvents]
      .reverse()
      .find((event) => event.type === "transfer" && event.source.kind === "table");
    if (resolution?.type === "transfer" && resolution.target.kind === "player")
      state.takeSeatId = resolution.target.seatId;
    scene.current?.update(state);
  }, [game, viewerSeatId, targetIds, focusedTargetId, narrow, hand]);

  const actor = game.players.find((player) => player.isCurrentActor);
  return (
    <section className="durak-table3d" aria-label="Игра за круглым столом">
      <div ref={host} className="table3d-canvas" />
      <div ref={labels} className="table3d-labels" aria-hidden="true" />
      <div className="table3d-vignette" />
      <div className="table3d-toolbar">
        <div className="table3d-title">
          <span className="table3d-live-dot" />
          <span>ВЕЧЕР ЗА СТОЛОМ</span>
          <span className="table3d-beta">3D</span>
        </div>
        <button type="button" className="table3d-classic" onClick={onClassic}>
          2D
        </button>
      </div>
      <aside className="table3d-keyboard" aria-label="Управление с клавиатуры">
        <span className="table3d-keyboard-state">
          {cursorVisible ? "ВЗГЛЯД ЗАКРЕПЛЁН" : "СВОБОДНЫЙ ВЗГЛЯД"}
        </span>
        <ul>
          <li>
            <span>Правила</span>
            <kbd>L</kbd>
          </li>
          {isHost && (
            <li>
              <span>Управление</span>
              <kbd>H</kbd>
            </li>
          )}
          {canSendLook && (
            <li>
              <span>Эмоции</span>
              <kbd>V</kbd>
            </li>
          )}
          {viewerSeatId && (
            <>
              <li>
                <span>Карта</span>
                <span>
                  <kbd>A</kbd>
                  <kbd>D</kbd>
                </span>
              </li>
              <li>
                <span>Выбрать</span>
                <kbd>Пробел</kbd>
              </li>
              <li className={targetIds.length ? "is-available" : ""}>
                <span>Цель защиты</span>
                <span>
                  <kbd>W</kbd>
                  <kbd>S</kbd>
                </span>
              </li>
              <li>
                <span>Сыграть</span>
                <kbd>E</kbd>
              </li>
              <li>
                <span>{secondaryLabel}</span>
                <kbd>F</kbd>
              </li>
            </>
          )}
          <li>
            <span>{cursorVisible ? "Свободный взгляд" : "Показать курсор"}</span>
            <kbd>Q</kbd>
          </li>
          <li>
            <span>К столу</span>
            <kbd>R</kbd>
          </li>
          {viewerSeatId && (
            <li>
              <span>Сортировка</span>
              <kbd>C</kbd>
            </li>
          )}
        </ul>
      </aside>
      <div className="table3d-information">
        <span
          className={`table3d-trump ${game.trumpSuit === "hearts" || game.trumpSuit === "diamonds" ? "is-red" : ""}`}
        >
          {game.trumpSuit ? getSuitSymbol(game.trumpSuit) : "—"}
          <small>козырь</small>
        </span>
        <span>
          <strong>{game.deckCount}</strong>
          <small>колода</small>
        </span>
        <span>
          <strong>{game.discardCount}</strong>
          <small>бито</small>
        </span>
      </div>
      <details className="table3d-roster">
        <summary>
          {game.players.length} за столом · {game.spectatorCount} зрителей
        </summary>
        <ul>
          {game.players.map((player) => (
            <li key={player.seatId}>
              <strong>
                {player.name}
                {player.seatId === viewerSeatId ? " (вы)" : ""}
              </strong>
              <span>
                {player.cardCount} карт ·{" "}
                {player.status === "out"
                  ? "вышел"
                  : player.controllerKind === "bot"
                    ? "бот"
                    : !player.connected
                      ? "нет связи"
                      : player.isCurrentActor
                        ? "ходит"
                        : "в игре"}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <div className="table3d-bottom-info">
        <span
          className={`table3d-turn ${actor?.seatId === viewerSeatId ? "is-yours" : ""}`}
          role="status"
        >
          {paused
            ? "Пауза"
            : actor
              ? `${actor.seatId === viewerSeatId ? "Ваш ход" : actor.name}${seconds !== null ? ` · ${seconds} с` : ""}`
              : "Раскладываем карты…"}
        </span>
      </div>
      {targetIds.length > 0 && (
        <div className="table3d-targets" aria-label="Цель защиты">
          {game.table
            .filter((pair) => targetIds.includes(pair.attack.id))
            .map((pair) => (
              <button
                type="button"
                key={pair.attack.id}
                className={focusedTargetId === pair.attack.id ? "is-focused" : ""}
                onClick={() => onDefend(pair.attack.id)}
              >
                <span>
                  {getDurakCardFace(pair.attack).rank}
                  {getSuitSymbol(pair.attack.suit)}
                </span>
                {focusedTargetId === pair.attack.id && <kbd>E</kbd>}
              </button>
            ))}
        </div>
      )}
      {failed && (
        <div className="table3d-failure" role="alert">
          <strong>Не удалось открыть 3D-стол</strong>
          <p>В браузере недоступна 3D-графика. Продолжите эту же партию в обычном виде.</p>
          <button type="button" className="btn btn-primary" onClick={onClassic}>
            Продолжить в 2D
          </button>
        </div>
      )}
    </section>
  );
}
