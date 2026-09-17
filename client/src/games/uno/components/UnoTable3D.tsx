import { useEffect, useMemo, useState } from "react";
import type { UnoPublicState } from "../../../../../shared/games/uno/types";
import RoundTableView from "../../shared/table3d/RoundTableView";
import type { RoundTableState } from "../../shared/table3d/RoundTableScene";
import { getUnoCardName } from "./UnoCard";

const COLORS = { red: "Красный", yellow: "Жёлтый", green: "Зелёный", blue: "Синий" };
interface Props {
  game: UnoPublicState;
  viewerSeatId: string | null;
  roomCode: string;
  canSendLook: boolean;
  cursorVisible: boolean;
  onCursorChange: (visible: boolean) => void;
  onClassic: () => void;
  paused: boolean;
  revision: number;
  secondary: string;
}
export default function UnoTable3D(props: Props) {
  const { game, viewerSeatId } = props;
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (game.turnRemainingMs === null) {
      setSeconds(null);
      return;
    }
    const end = Date.now() + game.turnRemainingMs;
    const update = () => setSeconds(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    update();
    if (props.paused) return;
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [game.turnRemainingMs, props.paused, props.revision]);
  const state = useMemo<RoundTableState>(() => {
    const card = game.topDiscard;
    const rank = !card
      ? ""
      : card.kind === "number"
        ? String(card.number)
        : { skip: "⊘", reverse: "↺", "draw-two": "+2", wild: "✦", "wild-draw-four": "+4" }[
            card.kind
          ];
    return {
      people: game.players.map((player) => ({
        id: player.seatId,
        name: player.name,
        count: player.cardCount,
        active: player.isCurrentActor,
        isBot: player.controllerKind === "bot",
        detail:
          player.status === "excluded"
            ? "покинул игру"
            : player.temporaryBot
              ? "временный бот"
              : !player.connected && player.controllerKind !== "bot"
                ? "нет связи"
                : player.isCurrentActor
                  ? "ходит"
                  : player.controllerKind === "bot"
                    ? "бот"
                    : "за столом",
      })),
      viewerId: viewerSeatId,
      cards: card
        ? [
            {
              id: card.id,
              rank,
              suit: "",
              red: false,
              color: card.color ?? "wild",
              x: 0,
              z: 0.5,
              covered: false,
              sourceId: game.lastPlayedBySeatId ?? "",
              selectable: false,
              focused: false,
            },
          ]
        : [],
      deckCount: game.drawPileCount,
      discardCount: game.discardPileCount,
      trump: null,
      takeSeatId: null,
    };
  }, [game, viewerSeatId]);
  const actor = game.players.find((player) => player.seatId === game.currentActorSeatId);
  return (
    <RoundTableView
      state={state}
      variant="uno"
      roomCode={props.roomCode}
      canSendLook={props.canSendLook}
      paused={props.paused}
      cursorVisible={props.cursorVisible}
      onCursorChange={props.onCursorChange}
      onClassic={props.onClassic}
      title="ЦВЕТНОЙ СТОЛ"
      shortcuts={
        viewerSeatId
          ? [
              { label: "Карта", keys: ["A", "D"] },
              { label: "Сыграть / цвет", keys: ["E"] },
              { label: props.secondary, keys: ["F"] },
              { label: "Оспорить +4", keys: ["G"] },
              { label: "Сказать UNO", keys: ["U"] },
              { label: "Поймать UNO", keys: ["X"] },
              { label: "Сортировка", keys: ["C"] },
            ]
          : []
      }
    >
      <div className="table3d-information uno3d-information">
        <span className={`uno3d-color is-${game.activeColor ?? "none"}`}>
          <strong>{game.activeColor ? COLORS[game.activeColor] : "—"}</strong>
          <small>активный цвет</small>
        </span>
        <span>
          <strong>{game.direction === "clockwise" ? "↻" : "↺"}</strong>
          <small>{game.direction === "clockwise" ? "по часовой" : "против часовой"}</small>
        </span>
        <span>
          <strong>{game.drawPileCount}</strong>
          <small>колода</small>
        </span>
      </div>
      <div className="uno3d-discard-label">
        {game.topDiscard ? getUnoCardName(game.topDiscard) : "Выбор начального цвета"}
      </div>
      <div className="table3d-bottom-info">
        <span className={`table3d-turn ${actor?.seatId === viewerSeatId ? "is-yours" : ""}`}>
          {props.paused
            ? "Пауза"
            : actor?.seatId === viewerSeatId
              ? "Ваш ход"
              : (actor?.name ?? "Раздача")}
          {seconds !== null && ` · ${seconds} с`}
        </span>
      </div>
      {(game.pendingWildDrawFour || game.lastChallengeResolution) && (
        <div className="uno3d-notice" role="status">
          {game.pendingWildDrawFour
            ? `Проверка +4 · ${actor?.name ?? "ожидание"} · прежний цвет: ${COLORS[game.pendingWildDrawFour.previousActiveColor]}`
            : game.lastChallengeResolution?.outcome === "challenge-succeeded"
              ? "Оспаривание удалось · сыгравший +4 берёт штраф"
              : game.lastChallengeResolution?.outcome === "challenge-failed"
                ? "Оспаривание не удалось · штраф +6"
                : "Штраф +4 принят"}
        </div>
      )}
    </RoundTableView>
  );
}
