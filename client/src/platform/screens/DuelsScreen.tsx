import { useEffect, useRef, useState } from "react";
import {
  FiAnchor,
  FiArrowRight,
  FiCheck,
  FiChevronDown,
  FiClock,
  FiCopy,
  FiGlobe,
  FiLayers,
  FiLock,
  FiUsers,
} from "react-icons/fi";
import { loginHref } from "../authNavigation";
import {
  DUEL_GAMES,
  DUEL_MAX_STAKE,
  DUEL_NAMES,
  type DuelAction,
  type DuelDirectory,
  type DuelGameId,
  type DuelRequest,
  type DuelSnapshot,
  type DuelSummary,
} from "../../../../shared/platform/duels";
import { FLEET, randomFleet, validFleet } from "../../../../shared/games/battleship/rules";
import { socket } from "../../socket";
import { useProfile } from "../context/ProfileContext";
import { useGameView } from "../context/GameViewPreferenceContext";
import { ProfileHeader } from "../components/ProfileHeader";
import { MenuFooter } from "../components/MenuFooter";
import { CoinAmount, coinLabel } from "../components/CoinAmount";
import { NotificationDialog } from "../components/NotificationDialog";
import { AccessibleModal } from "../components/AccessibleModal";
import { duelRegistry } from "../duelRegistry";
import { BattleshipBoard as Sea } from "../../games/battleship/BattleshipBoard";
import { ShipArtwork } from "../../games/battleship/ShipArtwork";
import { getShipSkin } from "../../../../shared/games/battleship/skins";
import { memorySymbols as symbols, visibleMemoryCards } from "../../games/memory/presentation";
import { sunkShips } from "../../games/battleship/presentation";
import { DuelTable3D } from "../../games/shared/duel3d/DuelTable3D";
import type { DuelTableModel } from "../../games/shared/duel3d/duelTableModel";
import {
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  sanitizeRoomCodeInput,
} from "../../../../shared/roomCode";
import "../../styles/duels-pet.css";
import "../../styles/feature-showcase.css";

const stateLabel = {
  waiting: "Ищет соперника",
  setup: "Расстановка",
  playing: "Игра идёт",
  finished: "Завершена",
};
function Match({
  duel,
  ownId,
  now,
  busy,
  play,
}: {
  duel: DuelSnapshot;
  ownId: string;
  now: number;
  busy: boolean;
  play: (action: DuelAction) => void;
}) {
  const own = duel.players.findIndex((p) => p.id === ownId);
  const [draft, setDraft] = useState<number[][] | null>(null);
  const [vertical, setVertical] = useState(false);
  const [seaView, setSeaView] = useState(1);
  const [error, setError] = useState("");
  const [is3D, setIs3D] = useGameView();
  const view = is3D ? "3d" : "2d";
  const [failed3d, setFailed3d] = useState(false);
  const changeView = (next: "2d" | "3d") => {
    setIs3D(next === "3d");
    setFailed3d(false);
  };
  const fallback = () => {
    setIs3D(false);
    setFailed3d(true);
  };
  const sea = duel.battleship;
  const yourTurn = duel.turnId === ownId;
  const setup = duel.phase === "setup" && own >= 0 && !sea?.ready[own];
  const memoryCards = duel.memory ? visibleMemoryCards(duel.memory, now) : [];
  const canFlip =
    !busy && yourTurn && duel.phase === "playing" && now >= (duel.memory?.revealUntil ?? 0);
  const boardIndex = own >= 0 ? ((setup ? 0 : seaView) === 0 ? own : 1 - own) : seaView;
  const ownBoard = own >= 0 && boardIndex === own;
  const canPlace = setup && !!draft && !busy;
  const canFire = own >= 0 && !ownBoard && !busy && yourTurn && duel.phase === "playing";
  const board = sea?.boards[boardIndex];
  const ships = board
    ? ownBoard
      ? ((setup ? (draft ?? sea?.ownShips) : sea?.ownShips) ?? [])
      : sunkShips(board)
    : [];
  const tableModel: DuelTableModel = {
    kind: duel.gameId,
    boardKey: `${duel.id}:${boardIndex}`,
    opponent: duel.players[own >= 0 ? 1 - own : 1] ?? { name: "Соперник" },
    companions: duel.players.flatMap((player, index) =>
      player.pet
        ? [
            {
              ownerId: player.id,
              ownerName: player.name,
              isOwn: player.id === ownId,
              seat: index === (own >= 0 ? own : 0) ? ("near" as const) : ("far" as const),
              pet: player.pet,
            },
          ]
        : [],
    ),
    skinId: sea?.shipSkins?.[boardIndex],
    ships,
    cells: duel.memory
      ? memoryCards.map((value, i) => ({
          value,
          matched: duel.memory!.matched[i],
          disabled: !canFlip || value !== null,
          label: `Карта ${i + 1}: ${value === null ? "закрыта" : symbols[value]}`,
        }))
      : (board ?? []).map((status, i) => ({
          value: null,
          status,
          disabled: status !== "unknown" || !(ownBoard ? canPlace : canFire),
          label: `${ownBoard ? "Ваше поле" : own >= 0 ? "Поле соперника" : `Поле ${duel.players[boardIndex].name}`}, ${"АБВГДЕЖЗИК"[i % 10]}${Math.floor(i / 10) + 1}: ${status === "unknown" ? (ships.some((ship) => ship.includes(i)) ? "корабль" : "неизвестно") : status === "miss" ? "мимо" : status === "sunk" ? "потоплен" : "попадание"}`,
        })),
  };
  const place = (cell: number) => {
    if (!draft || draft.length >= FLEET.length) return;
    const length = FLEET[draft.length];
    const ship = Array.from({ length }, (_, i) => cell + i * (vertical ? 10 : 1));
    if (
      ship.at(-1)! >= 100 ||
      (!vertical && Math.floor(cell / 10) !== Math.floor(ship.at(-1)! / 10)) ||
      ship.some((c) =>
        draft
          .flat()
          .some(
            (other) =>
              Math.abs((c % 10) - (other % 10)) <= 1 &&
              Math.abs(Math.floor(c / 10) - Math.floor(other / 10)) <= 1,
          ),
      )
    ) {
      setError("Корабли должны помещаться на поле и не соприкасаться.");
      return;
    }
    setError("");
    setDraft([...draft, ship]);
  };
  return (
    <>
      <div className="duel-score">
        {duel.players.map((p, i) => (
          <div key={p.id} className={duel.turnId === p.id ? "is-turn" : ""}>
            <strong>
              {p.name}
              {p.id === ownId ? " · Вы" : ""}
            </strong>
            <span>
              {duel.memory
                ? `Пары: ${duel.memory.scores[i]}`
                : sea?.ready[i]
                  ? "Флот готов"
                  : "Готовит флот"}
            </span>
          </div>
        ))}
      </div>
      {own < 0 && (
        <p className="feature-note">Вы наблюдаете. Закрытые карты и корабли игроков скрыты.</p>
      )}
      <div className="duel-view-switch" role="group" aria-label="Вид дуэли">
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={view === "2d"}
          onClick={() => changeView("2d")}
        >
          2D
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={view === "3d"}
          onClick={() => changeView("3d")}
        >
          3D · За столом
        </button>
      </div>
      {failed3d && (
        <p className="feature-note" role="status">
          Не удалось открыть 3D. Партия продолжается в 2D.
        </p>
      )}
      {duel.phase !== "finished" && (
        <p className="duel-turn" role="status">
          {duel.phase === "setup"
            ? "Подготовьте флот"
            : yourTurn
              ? "Ваш ход"
              : `Ход: ${duel.players.find((p) => p.id === duel.turnId)?.name ?? "…"}`}{" "}
          <span>· {Math.max(0, Math.ceil((duel.deadline - now) / 1000))} сек</span>
        </p>
      )}
      {duel.memory && view === "3d" && (
        <DuelTable3D
          model={tableModel}
          onCell={(cell) => play({ type: "flip", cell })}
          onFallback={fallback}
        />
      )}
      {duel.memory && view === "2d" && (
        <div className="memory-grid" aria-label="Поле: 12 пар">
          {memoryCards.map((card, i) => {
            return (
              <button
                type="button"
                key={i}
                className={`memory-card${duel.memory!.matched[i] ? " is-matched" : ""}${card !== null ? " is-open" : ""}`}
                disabled={!canFlip || card !== null}
                onClick={() => play({ type: "flip", cell: i })}
                aria-label={`Карта ${i + 1}: ${card === null ? "закрыта" : symbols[card]}`}
              >
                <span>{card === null ? "✦" : symbols[card]}</span>
              </button>
            );
          })}
        </div>
      )}
      {sea && (
        <>
          {own >= 0 && (
            <p className="fleet-appearance">
              Ваш флот: <strong>{getShipSkin(sea.shipSkins?.[own]).name}</strong>
            </p>
          )}
          {setup && (
            <div className="fleet-tools">
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  play({
                    type: "fleet",
                    ships: randomFleet((max) => Math.floor(Math.random() * max)),
                  });
                }}
              >
                Перемешать флот
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  setDraft([]);
                  setError("");
                }}
              >
                Расставить вручную
              </button>
              {draft && (
                <>
                  <button className="btn btn-secondary" onClick={() => setVertical(!vertical)}>
                    {vertical ? "Вертикально ↕" : "Горизонтально ↔"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setDraft(draft.slice(0, -1))}
                  >
                    Убрать последний
                  </button>
                  <p>
                    {draft.length < 10
                      ? `Поставьте корабль: ${FLEET[draft.length]} кл. (${draft.length + 1}/10)`
                      : "Флот расставлен"}
                  </p>
                </>
              )}
              {draft ? (
                <button
                  className="btn btn-primary"
                  disabled={busy || !validFleet(draft)}
                  onClick={() => {
                    play({ type: "fleet", ships: draft });
                    setDraft(null);
                  }}
                >
                  Сохранить расстановку
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => play({ type: "ready" })}
                >
                  Флот готов
                </button>
              )}
            </div>
          )}
          <div
            className={`sea-tabs${setup ? " is-setup" : ""}${view === "3d" ? " is-3d" : ""}`}
            aria-label="Выбор поля"
          >
            {[0, 1].map((i) => (
              <button
                key={i}
                type="button"
                aria-pressed={(setup ? 0 : seaView) === i}
                disabled={setup && i === 1}
                onClick={() => setSeaView(i)}
              >
                {own >= 0 ? (i === 0 ? "Ваш флот" : "Соперник") : duel.players[i].name}
              </button>
            ))}
          </div>
          {view === "3d" ? (
            <DuelTable3D
              model={tableModel}
              onCell={(cell) => (ownBoard ? place(cell) : play({ type: "fire", cell }))}
              onFallback={fallback}
            />
          ) : (
            <div
              className={`sea-boards show-board-${setup ? 0 : seaView}${setup ? "" : " has-tabs"}`}
            >
              {own >= 0 ? (
                <>
                  <section>
                    <h3>Ваш флот</h3>
                    <Sea
                      label="Ваше поле"
                      board={sea.boards[own]}
                      ships={setup ? (draft ?? sea.ownShips) : sea.ownShips}
                      skinId={sea.shipSkins?.[own]}
                      disabled={!setup || !draft || busy}
                      onCell={place}
                    />
                  </section>
                  <section>
                    <h3>Поле соперника</h3>
                    <Sea
                      label="Поле соперника"
                      board={sea.boards[1 - own]}
                      skinId={sea.shipSkins?.[1 - own]}
                      disabled={busy || !yourTurn || duel.phase !== "playing"}
                      onCell={(cell) => play({ type: "fire", cell })}
                    />
                  </section>
                </>
              ) : (
                sea.boards.map((board, i) => (
                  <section key={i}>
                    <h3>{duel.players[i].name}</h3>
                    <Sea
                      label={`Поле ${duel.players[i].name}`}
                      board={board}
                      skinId={sea.shipSkins?.[i]}
                      disabled
                    />
                  </section>
                ))
              )}
            </div>
          )}
          <div className="sea-legend" aria-label="Обозначения на поле">
            <span>
              <ShipArtwork length={2} /> корабль
            </span>
            <span>
              <i aria-hidden="true">×</i> попадание
            </span>
            <span>
              <i className="legend-sunk" aria-hidden="true">
                ×
              </i>{" "}
              потоплен
            </span>
            <span>
              <i aria-hidden="true">•</i> промах
            </span>
          </div>
        </>
      )}
      {error && (
        <NotificationDialog
          title="Не удалось разместить корабль"
          message={error}
          kind="error"
          onClose={() => setError("")}
        />
      )}
    </>
  );
}

export function DuelsScreen() {
  const { profile, connected } = useProfile();
  const [data, setData] = useState<DuelDirectory | null>(null);
  const [selection, setSelection] = useState<{ id?: string; code?: string }>({});
  const { id, code: viewCode } = selection;
  const setId = (id?: string, code?: string) => setSelection({ id, code });
  const [codeInput, setCodeInput] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [copyNotice, setCopyNotice] = useState(false);
  const [gameId, setGameId] = useState<DuelGameId>("memory");
  const [stake, setStake] = useState("0");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pendingCreate = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const offset = useRef(0);
  const [confirm, setConfirm] = useState<DuelSummary | "leave" | null>(null);
  const epoch = useRef(0);
  const accountId = useRef(profile?.id);
  accountId.current = profile?.id;
  useEffect(() => {
    busyRef.current = false;
    pendingCreate.current = null;
    setBusy(false);
    setConfirm(null);
    setError("");
  }, [profile?.id]);
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get("duel");
    if (requested) setId(requested);
  }, []);
  useEffect(() => {
    setCopyNotice(false);
    if (id && id !== "list") window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [id]);
  useEffect(() => {
    setData(null);
    if (!profile || !connected) return;
    const current = ++epoch.current;
    let inFlight = false;
    const refresh = () => {
      if (inFlight || busyRef.current) return;
      inFlight = true;
      socket.timeout(8000).emit("duels:get", { id, code: viewCode }, (timeout, result) => {
        inFlight = false;
        if (epoch.current !== current || busyRef.current) return;
        if (timeout) {
          setError("Нет ответа сервера. Переподключаемся…");
          return;
        }
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (id === undefined && result.value.selected)
          setId(result.value.selected.id, result.value.selected.code);
        offset.current = result.value.serverNow - Date.now();
        setData((previous) =>
          previous && previous.serverNow > result.value.serverNow ? previous : result.value,
        );
        setNow(result.value.serverNow);
      });
    };
    const pushed = (value: DuelDirectory) => {
      if (epoch.current !== current) return;
      offset.current = value.serverNow - Date.now();
      setData((previous) => (previous && previous.serverNow > value.serverNow ? previous : value));
      setNow(value.serverNow);
    };
    socket.on("duels:snapshot", pushed);
    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => {
      epoch.current++;
      window.clearInterval(timer);
      socket.off("duels:snapshot", pushed);
      socket.emit("duels:unsubscribe");
    };
  }, [profile?.id, connected, id, viewCode]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => window.clearInterval(timer);
  }, []);
  const command = (request: DuelRequest) => {
    if (!connected || busyRef.current) return;
    const actorId = profile?.id;
    busyRef.current = true;
    setBusy(true);
    setError("");
    socket.timeout(10000).emit("duels:command", request, (timeout, result) => {
      if (accountId.current !== actorId) return;
      busyRef.current = false;
      setBusy(false);
      if (timeout) {
        setError(
          "Ответ задержался. Баланс и дуэль обновятся автоматически; не создавайте новую ставку.",
        );
        return;
      }
      if (!result.ok) {
        setError(result.error);
        setConfirm(null);
        return;
      }
      pendingCreate.current = null;
      offset.current = result.value.serverNow - Date.now();
      if (result.value.selected) setId(result.value.selected.id, result.value.selected.code);
      setData((previous) =>
        previous && previous.serverNow > result.value.serverNow ? previous : result.value,
      );
      setNow(result.value.serverNow);
      setConfirm(null);
    });
  };
  const openByCode = () => {
    const code = normalizeRoomCode(codeInput);
    if (!profile || !connected || !code || busyRef.current) return;
    const actorId = profile.id;
    const current = epoch.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    socket.timeout(8000).emit("duels:get", { code }, (timeout, result) => {
      if (accountId.current !== actorId) return;
      busyRef.current = false;
      setBusy(false);
      if (epoch.current !== current) return;
      if (timeout) {
        setError("Нет ответа сервера. Попробуйте открыть дуэль ещё раз");
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.value.selected) setId(result.value.selected.id, result.value.selected.code);
    });
  };
  const duel = data?.selected;
  const active = data?.mine.find((d) => d.phase !== "finished");
  const own = duel?.players.some((p) => p.id === profile?.id);
  const play = (action: DuelAction) => {
    if (duel) command({ type: "play", id: duel.id, revision: duel.revision, action });
  };
  return (
    <div className="show-menu feature-page duels-page">
      <div className="show-menu-shell">
        <ProfileHeader activePage="duels" />
        <main className="feature-main">
          <header className="feature-heading" hidden={!!duel}>
            <div>
              <h1>Дуэли</h1>
              <p>Бросьте вызов другу в 2D или за 3D-столом. Весь банк — победителю.</p>
            </div>
            <span className="feature-heading-badge">
              <FiUsers aria-hidden="true" /> Ставка от 0 монет
            </span>
          </header>
          {!profile && (
            <div className="feature-panel duel-guest-intro">
              <div>
                <h2>Готовы принять вызов?</h2>
                <p>Войдите, чтобы сыграть за монеты или устроить дружескую партию со ставкой 0.</p>
              </div>
              <a
                className="btn btn-primary"
                href={loginHref(
                  id && id !== "list" ? `/duels?duel=${encodeURIComponent(id)}` : "/duels",
                )}
              >
                Войти и сыграть
              </a>
            </div>
          )}
          {duel ? (
            <section className="feature-panel duel-match">
              <div className="duel-match-heading">
                <button className="btn btn-secondary" onClick={() => setId("list")}>
                  ← Все дуэли
                </button>
                <h1>{DUEL_NAMES[duel.gameId]}</h1>
                <span>
                  Банк <CoinAmount amount={duel.stake * duel.players.length} />
                </span>
              </div>
              <p className="duel-access-note">
                {duel.isPrivate ? <FiLock aria-hidden="true" /> : <FiGlobe aria-hidden="true" />}
                {duel.isPrivate ? "Приватная дуэль · вход только по коду" : "Открытая дуэль"}
                {duel.phase !== "waiting" && <strong>{duel.code}</strong>}
              </p>
              {duel.phase === "waiting" ? (
                <div className="duel-wait">
                  <span className="duel-wait-icon" aria-hidden="true">
                    <FiUsers />
                  </span>
                  <h3>Ждём соперника</h3>
                  <p className="duel-wait-stake">
                    Ставка <CoinAmount amount={duel.stake} />
                  </p>
                  <div className="duel-invitation">
                    <label htmlFor="duel-invite">Код приглашения</label>
                    <div className="duel-invitation-controls">
                      <input
                        id="duel-invite"
                        className="duel-invite-code"
                        readOnly
                        value={duel.code}
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        className="btn btn-secondary duel-copy-code"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(duel.code);
                            setCopyNotice(true);
                          } catch {
                            setError(
                              "Не удалось скопировать. Выделите код и скопируйте его вручную",
                            );
                          }
                        }}
                      >
                        <FiCopy aria-hidden="true" /> Скопировать код
                      </button>
                    </div>
                    <p className="feature-note">
                      Другу нужно открыть «Дуэли» и ввести эти 4 буквы.
                    </p>
                  </div>
                  <p className="duel-wait-time">
                    <FiClock aria-hidden="true" /> Ожидание до 10 минут. Если никто не
                    присоединится, ставка вернётся.
                  </p>
                  {!own && (
                    <button
                      className="btn btn-primary"
                      disabled={busy || !connected || !!active}
                      onClick={() => setConfirm(duel)}
                    >
                      Принять вызов
                    </button>
                  )}
                </div>
              ) : duel.phase === "finished" ? (
                (duel.memory || duel.battleship) && (
                  <details className="duel-final-board">
                    <summary>Показать итоговое поле</summary>
                    <Match
                      key={duel.id}
                      duel={duel}
                      ownId={profile?.id ?? ""}
                      now={now}
                      busy
                      play={play}
                    />
                  </details>
                )
              ) : (
                <Match
                  key={duel.id}
                  duel={duel}
                  ownId={profile?.id ?? ""}
                  now={now}
                  busy={busy || !connected}
                  play={play}
                />
              )}
              {duel.phase === "finished" && (
                <div className="duel-result" role="status">
                  <h3>
                    {duel.winnerId
                      ? `Победитель: ${duel.players.find((p) => p.id === duel.winnerId)?.name}`
                      : duel.memory?.matched.every(Boolean)
                        ? "Ничья"
                        : "Ставки возвращены"}
                  </h3>
                  <p>{duel.reason}</p>
                  {duel.memory && (
                    <p>
                      Пары: {duel.players[0].name} — {duel.memory.scores[0]}, {duel.players[1].name}{" "}
                      — {duel.memory.scores[1]}.
                    </p>
                  )}
                  <p>
                    {duel.winnerId
                      ? `Победитель получил ${duel.stake * 2} ${coinLabel(duel.stake * 2)}.`
                      : "Каждый участник получил свою ставку обратно."}
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setGameId(duel.gameId);
                      setStake(String(duel.stake));
                      setIsPrivate(duel.isPrivate);
                      setId("list");
                    }}
                  >
                    Новая дуэль
                  </button>
                </div>
              )}
              {own && duel.phase !== "finished" && (
                <button
                  className="duel-leave"
                  disabled={busy || !connected}
                  onClick={() => setConfirm("leave")}
                >
                  {duel.phase === "waiting" ? "Отменить и вернуть ставку" : "Сдаться"}
                </button>
              )}
            </section>
          ) : (
            <div className={`duel-lobby${profile ? "" : " is-guest"}`}>
              <div className="duel-game-options">
                {DUEL_GAMES.map((g) => (
                  <button
                    key={g}
                    className={`duel-game-option is-${g}`}
                    aria-pressed={gameId === g}
                    onClick={() => setGameId(g)}
                  >
                    <span className="duel-option-tag">
                      {g === "memory" ? "12 пар" : "10 кораблей"}
                    </span>
                    <span className="duel-option-check" aria-hidden="true">
                      <FiCheck />
                    </span>
                    <span className="duel-game-art" aria-hidden="true">
                      {g === "memory" ? (
                        <>
                          <i>★</i>
                          <i>★</i>
                          <i>?</i>
                        </>
                      ) : (
                        <>
                          <span className="duel-fleet-art">
                            <FiAnchor />
                            <span>×</span>
                            <span>·</span>
                          </span>
                        </>
                      )}
                    </span>
                    <strong>
                      {DUEL_NAMES[g]}
                      <FiArrowRight aria-hidden="true" />
                    </strong>
                    <small>{duelRegistry[g].subtitle}</small>
                  </button>
                ))}
              </div>
              {profile && (
                <section className="feature-panel duel-create">
                  <h2>
                    <FiLayers aria-hidden="true" />
                    {active ? "Ваша дуэль" : "Создать вызов"}
                  </h2>
                  {active ? (
                    <>
                      <p>У вас уже есть активная дуэль.</p>
                      <button className="btn btn-primary" onClick={() => setId(active.id)}>
                        Вернуться в дуэль
                      </button>
                    </>
                  ) : (
                    <>
                      <fieldset className="duel-access-options" disabled={busy}>
                        <legend>Доступ к дуэли</legend>
                        {[
                          {
                            private: false,
                            title: "Открытая",
                            hint: "Видна всем в списке",
                            Icon: FiGlobe,
                          },
                          {
                            private: true,
                            title: "Приватная",
                            hint: "Только по коду",
                            Icon: FiLock,
                          },
                        ].map(({ private: privateAccess, title, hint, Icon }) => (
                          <label
                            key={title}
                            className={isPrivate === privateAccess ? "is-selected" : ""}
                          >
                            <input
                              type="radio"
                              name="duel-access"
                              checked={isPrivate === privateAccess}
                              onChange={() => setIsPrivate(privateAccess)}
                            />
                            <Icon aria-hidden="true" />
                            <span>
                              <strong>{title}</strong>
                              <small>{hint}</small>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      <label>
                        Ставка (монет)
                        <input
                          type="number"
                          min="0"
                          max={Math.min(profile.coins, DUEL_MAX_STAKE)}
                          step="1"
                          inputMode="numeric"
                          value={stake}
                          onFocus={(e) => {
                            if (e.target.value === "0") e.target.select();
                          }}
                          onChange={(e) => setStake(e.target.value.replace(/^0+(?=\d)/, ""))}
                          onBlur={() => setStake((value) => value.trim() || "0")}
                        />
                      </label>
                      <div className="duel-stake-summary">
                        <span>
                          Банк победителя{" "}
                          <strong>
                            {" "}
                            {Number.isSafeInteger(Number(stake)) && Number(stake) >= 0
                              ? Number(stake) * 2
                              : "—"}
                          </strong>
                        </span>
                      </div>
                      <button
                        className="btn btn-primary"
                        disabled={
                          busy ||
                          !connected ||
                          !data ||
                          stake.trim() === "" ||
                          !Number.isSafeInteger(Number(stake)) ||
                          Number(stake) < 0 ||
                          Number(stake) > Math.min(profile.coins, DUEL_MAX_STAKE)
                        }
                        onClick={() => {
                          pendingCreate.current ??= crypto.randomUUID();
                          command({
                            type: "create",
                            requestId: pendingCreate.current,
                            gameId,
                            stake: Number(stake),
                            isPrivate,
                          });
                        }}
                      >
                        {busy
                          ? "Создаём…"
                          : `Создать дуэль · ${stake || 0} ${coinLabel(Number(stake))}`}
                      </button>
                      <small>
                        Ставка спишется при создании. До входа соперника её можно вернуть.
                      </small>
                      {gameId === "battleship" && (
                        <div className="fleet-appearance">
                          <span>
                            Ваш флот:{" "}
                            <strong>{getShipSkin(profile.equipped.battleship).name}</strong>
                          </span>
                          <a href="/collection?kind=battleship">Выбрать скин</a>
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}
              {profile && (
                <section className="feature-panel duel-open">
                  <form
                    className="duel-code-entry"
                    onSubmit={(e) => {
                      e.preventDefault();
                      openByCode();
                    }}
                  >
                    <h2>
                      <FiLock aria-hidden="true" /> Дуэль по коду
                    </h2>
                    <label htmlFor="duel-code">Код дуэли · 4 латинские буквы</label>
                    <div className="duel-code-controls">
                      <input
                        id="duel-code"
                        className="duel-invite-code"
                        value={codeInput}
                        placeholder="ABCD"
                        maxLength={ROOM_CODE_LENGTH}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        onChange={(e) => setCodeInput(sanitizeRoomCodeInput(e.target.value))}
                      />
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={busy || !connected || !normalizeRoomCode(codeInput)}
                      >
                        Открыть
                      </button>
                    </div>
                    <small>Введите код от друга, затем подтвердите ставку.</small>
                  </form>
                  <h2>
                    <FiUsers aria-hidden="true" />
                    Открытые дуэли
                    {data && <span className="duel-open-count">{data.rooms.length}</span>}
                  </h2>
                  {!data ? (
                    <div className="duel-empty" role="status">
                      <FiClock aria-hidden="true" />
                      <strong>Ищем вызовы…</strong>
                      <p>Здесь появятся дуэли других игроков.</p>
                    </div>
                  ) : !data.rooms.length ? (
                    <div className="duel-empty">
                      <FiUsers aria-hidden="true" />
                      <strong>Первый вызов за вами</strong>
                      <p>Создайте дуэль и отправьте код другу — или дождитесь соперника здесь.</p>
                      <span>Дружеская партия? Выбирайте ставку 0.</span>
                    </div>
                  ) : (
                    <ul className="duel-list">
                      {data.rooms.map((d) => (
                        <li key={d.id}>
                          <div>
                            <strong>{DUEL_NAMES[d.gameId]}</strong>
                            <span>
                              {d.players.map((p) => p.name).join(" · ")} · {stateLabel[d.phase]}
                            </span>
                          </div>
                          <CoinAmount amount={d.stake} />
                          <button className="btn btn-secondary" onClick={() => setId(d.id)}>
                            {d.players.some((p) => p.id === profile.id)
                              ? "Открыть"
                              : d.phase === "waiting"
                                ? "Посмотреть вызов"
                                : "Наблюдать"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          )}
          <div className={`duel-info-panels${duel ? " is-room" : ""}`}>
            {!duel && !!data?.mine.length && (
              <details className="feature-panel duel-history">
                <summary>Ваши последние дуэли</summary>
                <ul className="duel-list">
                  {data.mine.map((d) => (
                    <li key={d.id}>
                      <span>
                        {DUEL_NAMES[d.gameId]} · {stateLabel[d.phase]}
                      </span>
                      <button className="btn btn-secondary" onClick={() => setId(d.id)}>
                        Открыть
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <details className="duel-rules feature-panel">
              <summary>
                <span>
                  <FiLayers aria-hidden="true" />
                  Правила и условия дуэлей
                </span>
                <FiChevronDown className="pet-guide-chevron" aria-hidden="true" />
              </summary>
              {DUEL_GAMES.map((g) => (
                <details key={g}>
                  <summary>{DUEL_NAMES[g]} · правила</summary>
                  <p>{duelRegistry[g].text}</p>
                </details>
              ))}
              <details>
                <summary>Ставки, время и переподключение</summary>
                <p>
                  Ставка — целое число от 0 до {DUEL_MAX_STAKE} монет профиля. Оба игрока вносят
                  одинаковую сумму. Победитель получает весь банк без комиссии; при ничьей ставки
                  возвращаются. Обычные награды за партию в дуэлях не начисляются.
                </p>
                <p>
                  На ход — 90 секунд. За сдачу или пропуск времени засчитывается поражение. Закрытие
                  вкладки не останавливает таймер: войдите в тот же аккаунт и откройте «Дуэли»,
                  чтобы продолжить. В морском бое на подготовку 3 минуты: если готов только один
                  игрок, он побеждает; если никто — ставки возвращаются.
                </p>
                <p>
                  Дуэли проходят между двумя аккаунтами, без ботов. Зрители могут наблюдать за
                  открытыми действиями.
                </p>
                <p>
                  У каждой дуэли есть код из 4 латинских букв. Открытые дуэли видны в общем списке;
                  приватные доступны только участникам и тем, кому вы передали код.
                </p>
              </details>
            </details>
          </div>
        </main>
        {!duel && <MenuFooter />}
      </div>
      {confirm && (
        <AccessibleModal labelledBy="duel-confirm-title" onClose={() => !busy && setConfirm(null)}>
          <h2 id="duel-confirm-title">
            {confirm === "leave"
              ? duel?.phase === "waiting"
                ? "Отменить дуэль?"
                : "Сдаться?"
              : "Принять вызов?"}
          </h2>
          <p>
            {confirm === "leave"
              ? duel?.phase === "waiting"
                ? "Ваша ставка вернётся на баланс."
                : "Соперник победит и получит весь банк."
              : `С баланса спишется ${confirm.stake} ${coinLabel(confirm.stake)}. Банк победителя — ${confirm.stake * 2} ${coinLabel(confirm.stake * 2)}.`}
          </p>
          <div className="modal-actions">
            <button
              className="btn btn-primary"
              disabled={busy || !connected}
              onClick={() => {
                if (confirm === "leave" && duel)
                  command({ type: "leave", id: duel.id, revision: duel.revision });
                else if (confirm !== "leave")
                  command({
                    type: "join",
                    id: confirm.id,
                    revision: confirm.revision,
                    stake: confirm.stake,
                    code: confirm.code,
                  });
              }}
            >
              Подтвердить
            </button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>
              Назад
            </button>
          </div>
        </AccessibleModal>
      )}
      {(error || copyNotice) && (
        <NotificationDialog
          title={error ? "Не удалось выполнить действие" : "Код скопирован"}
          message={error || "Отправьте код другу: он сможет ввести его в разделе «Дуэли»."}
          kind={error ? "error" : "success"}
          onClose={() => {
            setError("");
            setCopyNotice(false);
          }}
        />
      )}
    </div>
  );
}
