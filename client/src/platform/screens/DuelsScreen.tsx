import { useEffect, useRef, useState } from "react";
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
import { ProfileHeader } from "../components/ProfileHeader";
import { MenuFooter } from "../components/MenuFooter";
import { CoinAmount, coinLabel } from "../components/CoinAmount";
import { AccessibleModal } from "../components/AccessibleModal";
import { duelRegistry } from "../duelRegistry";
import "../../styles/duels-pet.css";

const symbols = ["🍒", "🍋", "🍇", "🍀", "🌙", "⭐", "🔥", "💎", "🎲", "🎵", "🌸", "🦋"];
const stateLabel = {
  waiting: "Ищет соперника",
  setup: "Расстановка",
  playing: "Игра идёт",
  finished: "Завершена",
};
function Sea({
  board,
  ships,
  onCell,
  disabled,
  label,
}: {
  board: string[];
  ships?: number[][] | null;
  onCell?: (cell: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="sea-grid" role="group" aria-label={label}>
      {board.map((value, i) => {
        const ship = ships?.some((s) => s.includes(i));
        const status =
          value === "unknown"
            ? ship
              ? "корабль"
              : "неизвестно"
            : value === "miss"
              ? "мимо"
              : value === "sunk"
                ? "потоплен"
                : "попадание";
        return (
          <button
            key={i}
            type="button"
            className={`sea-cell is-${value}${ship ? " has-ship" : ""}`}
            disabled={disabled || !onCell || value !== "unknown"}
            onClick={() => onCell?.(i)}
            aria-label={`${label}, ${"АБВГДЕЖЗИК"[i % 10]}${Math.floor(i / 10) + 1}: ${status}`}
          >
            {value === "hit" || value === "sunk" ? "×" : value === "miss" ? "·" : ship ? "▪" : ""}
          </button>
        );
      })}
    </div>
  );
}
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
  const sea = duel.battleship;
  const yourTurn = duel.turnId === ownId;
  const setup = duel.phase === "setup" && own >= 0 && !sea?.ready[own];
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
      {duel.memory && (
        <div className="memory-grid" aria-label="Поле: 12 пар">
          {duel.memory.cards.map((value, i) => {
            const card =
              duel.memory!.matched[i] ||
              duel.memory!.open.length < 2 ||
              now < duel.memory!.revealUntil
                ? value
                : null;
            return (
              <button
                type="button"
                key={i}
                className={`memory-card${duel.memory!.matched[i] ? " is-matched" : ""}${card !== null ? " is-open" : ""}`}
                disabled={
                  busy ||
                  !yourTurn ||
                  card !== null ||
                  now < duel.memory!.revealUntil ||
                  duel.phase !== "playing"
                }
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
          {error && <p role="alert">{error}</p>}
          <div className={`sea-tabs${setup ? " is-setup" : ""}`} aria-label="Выбор поля">
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
                    ships={draft ?? sea.ownShips}
                    disabled={!setup || !draft || busy}
                    onCell={place}
                  />
                </section>
                <section>
                  <h3>Поле соперника</h3>
                  <Sea
                    label="Поле соперника"
                    board={sea.boards[1 - own]}
                    disabled={busy || !yourTurn || duel.phase !== "playing"}
                    onCell={(cell) => play({ type: "fire", cell })}
                  />
                </section>
              </>
            ) : (
              sea.boards.map((board, i) => (
                <section key={i}>
                  <h3>{duel.players[i].name}</h3>
                  <Sea label={`Поле ${duel.players[i].name}`} board={board} disabled />
                </section>
              ))
            )}
          </div>
          <p className="feature-note">
            ▪ корабль · × попадание · точка — промах. Потопленные корабли отмечены красным.
          </p>
        </>
      )}
    </>
  );
}

export function DuelsScreen() {
  const { profile, connected } = useProfile();
  const [data, setData] = useState<DuelDirectory | null>(null);
  const [id, setId] = useState<string | undefined>();
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
      socket.timeout(8000).emit("duels:get", { id }, (timeout, result) => {
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
        if (id === undefined && result.value.selected) setId(result.value.selected.id);
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
  }, [profile?.id, connected, id]);
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
      if (result.value.selected) setId(result.value.selected.id);
      setData((previous) =>
        previous && previous.serverNow > result.value.serverNow ? previous : result.value,
      );
      setNow(result.value.serverNow);
      setConfirm(null);
    });
  };
  const duel = data?.selected;
  const active = data?.mine.find((d) => d.phase !== "finished");
  const own = duel?.players.some((p) => p.id === profile?.id);
  const play = (action: DuelAction) => {
    if (duel) command({ type: "play", id: duel.id, revision: duel.revision, action });
  };
  return (
    <div className="show-menu feature-page">
      <div className="show-menu-shell">
        <ProfileHeader activePage="duels" />
        <main className="feature-main">
          <header className="feature-heading" hidden={!!duel}>
            <h1>Дуэли</h1>
            <p>Два игрока. Одна ставка. Весь банк — победителю.</p>
          </header>
          {!profile && (
            <div className="feature-panel duel-guest-intro">
              <p>Играйте за монеты профиля или выбирайте ставку 0 для дружеской партии.</p>
              <a className="btn btn-primary" href={loginHref("/duels")}>
                Войти и сыграть
              </a>
            </div>
          )}
          {profile && !connected && (
            <p role="status">
              Соединение потеряно. Вернём дуэль после подключения. Таймер продолжает идти.
            </p>
          )}
          {error && (
            <p role="alert" className="feature-error">
              {error}
            </p>
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
              {duel.phase === "waiting" ? (
                <div className="duel-wait">
                  <span aria-hidden="true">◎</span>
                  <h3>Ждём соперника</h3>
                  <p>
                    Ставка каждого: <CoinAmount amount={duel.stake} />. Ожидание до 10 минут, затем
                    монеты вернутся.
                  </p>
                  <label>
                    Ссылка на дуэль
                    <input
                      readOnly
                      value={
                        typeof window === "undefined"
                          ? ""
                          : `${location.origin}/duels?duel=${duel.id}`
                      }
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
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
                    <span className="duel-game-art" aria-hidden="true">
                      {g === "memory" ? (
                        <>
                          <i>✦</i>
                          <i>✦</i>
                          <i>?</i>
                        </>
                      ) : (
                        <>
                          <i>⚓</i>
                          <i>·</i>
                          <i>×</i>
                        </>
                      )}
                    </span>
                    <strong>{DUEL_NAMES[g]}</strong>
                    <small>{duelRegistry[g].subtitle}</small>
                  </button>
                ))}
              </div>
              {profile && (
                <section className="feature-panel duel-create">
                  {active ? (
                    <>
                      <p>У вас уже есть активная дуэль.</p>
                      <button className="btn btn-primary" onClick={() => setId(active.id)}>
                        Вернуться в дуэль
                      </button>
                    </>
                  ) : (
                    <>
                      <label>
                        Ставка каждого, монет
                        <input
                          type="number"
                          min="0"
                          max={Math.min(profile.coins, DUEL_MAX_STAKE)}
                          step="1"
                          value={stake}
                          onChange={(e) => setStake(e.target.value)}
                        />
                      </label>
                      <p>
                        Ваш баланс: <CoinAmount amount={profile.coins} /> · Банк:{" "}
                        {Number.isSafeInteger(Number(stake)) && Number(stake) >= 0
                          ? Number(stake) * 2
                          : "—"}
                      </p>
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
                    </>
                  )}
                </section>
              )}
              {profile && (
                <section className="feature-panel duel-open">
                  <h2>Открытые дуэли</h2>
                  {!data ? (
                    <p>Загружаем дуэли…</p>
                  ) : !data.rooms.length ? (
                    <p>Пока тихо. Создайте первый вызов!</p>
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
              {!!data?.mine.length && (
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
            </div>
          )}
          <details className="duel-rules feature-panel">
            <summary>Правила и условия дуэлей</summary>
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
                вкладки не останавливает таймер: войдите в тот же аккаунт и откройте «Дуэли», чтобы
                продолжить. В морском бое на подготовку 3 минуты: если готов только один игрок, он
                побеждает; если никто — ставки возвращаются.
              </p>
              <p>
                Дуэли проходят между двумя аккаунтами, без ботов. Зрители могут наблюдать за
                открытыми действиями.
              </p>
            </details>
          </details>
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
                  });
              }}
            >
              Подтвердить
            </button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>
              Назад
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </AccessibleModal>
      )}
    </div>
  );
}
