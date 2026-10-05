import { useEffect, useState } from "react";
import { FiAward, FiChevronLeft, FiChevronRight, FiRefreshCw } from "react-icons/fi";
import {
  LEADERBOARD_SORTS,
  type LeaderboardEntry,
  type LeaderboardSnapshot,
  type LeaderboardSort,
} from "../../../../shared/platform/leaderboard";
import { socket } from "../../socket";
import { useProfile } from "../context/ProfileContext";
import { AvatarPortrait } from "../components/AvatarPortrait";
import { CoinAmount } from "../components/CoinAmount";
import { MenuFooter } from "../components/MenuFooter";
import { ProfileHeader } from "../components/ProfileHeader";
import "../../styles/show-menu.css";
import "../../styles/leaderboard.css";

const metrics: Record<LeaderboardSort, { label: string; description: string }> = {
  wins: { label: "Победы", description: "Те, кто знает путь к победе." },
  games: { label: "Партии", description: "Те, кто всегда готов к следующей игре." },
  coins: { label: "Монеты", description: "Самые большие запасы монет прямо сейчас." },
  collection: { label: "Коллекция", description: "Больше разных персонажей и карт — выше место." },
};
const number = (value: number) => value.toLocaleString("ru-RU");

function PlayerRow({
  entry,
  self,
  sort,
}: {
  entry: LeaderboardEntry;
  self: boolean;
  sort: LeaderboardSort;
}) {
  return (
    <tr className={self ? "is-self" : undefined}>
      <td className="leaderboard-rank">
        <span data-place={entry.rank}>#{entry.rank}</span>
      </td>
      <th scope="row" className="leaderboard-player">
        <AvatarPortrait avatarId={entry.avatarId} />
        <span>
          {entry.nickname}
          {self && <small>Это вы</small>}
        </span>
      </th>
      {LEADERBOARD_SORTS.map((metric) => (
        <td
          key={metric}
          className={sort === metric ? "is-selected" : undefined}
          data-label={metrics[metric].label}
        >
          {metric === "coins" ? (
            <CoinAmount amount={entry.coins} label="" />
          ) : (
            number(entry[metric])
          )}
        </td>
      ))}
    </tr>
  );
}

export function LeaderboardScreen() {
  const { profile, connected } = useProfile();
  const [sort, setSort] = useState<LeaderboardSort>("wins");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    setPending(true);
    setError(null);
    const timeout = window.setTimeout(() => {
      if (!active) return;
      active = false;
      setPending(false);
      setError("Не удалось загрузить рейтинг. Попробуйте ещё раз.");
    }, 10_000);
    socket.emit("leaderboard:get", { sort, page }, (result) => {
      if (!active) return;
      window.clearTimeout(timeout);
      setPending(false);
      if (result.ok) {
        setSnapshot(result.value);
        if (result.value.page !== page) setPage(result.value.page);
      } else setError(result.error);
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [sort, page, refresh, connected, profile?.id]);

  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setRefresh((value) => value + 1);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [connected]);

  const current = snapshot?.sort === sort && snapshot.page === page ? snapshot : null;
  const chooseSort = (next: LeaderboardSort) => {
    setSort(next);
    setPage(1);
  };
  return (
    <div className="show-menu leaderboard-page">
      <div className="show-menu-shell">
        <ProfileHeader activePage="leaderboard" />
        <main className="leaderboard-content">
          <header className="leaderboard-heading">
            <div>
              <h1>
                <FiAward aria-hidden="true" /> Рейтинг
              </h1>
              <p>{metrics[sort].description}</p>
            </div>
            <div className="leaderboard-controls">
              {snapshot && <span>{number(snapshot.totalPlayers)} игроков</span>}
              <button
                type="button"
                onClick={() => setRefresh((value) => value + 1)}
                disabled={!connected || pending}
                aria-label="Обновить рейтинг"
              >
                <FiRefreshCw aria-hidden="true" /> Обновить
              </button>
            </div>
          </header>
          <nav className="leaderboard-sorts" aria-label="Сортировка рейтинга">
            {LEADERBOARD_SORTS.map((metric) => (
              <button
                type="button"
                key={metric}
                aria-pressed={sort === metric}
                onClick={() => chooseSort(metric)}
              >
                {metrics[metric].label} {sort === metric && <span aria-hidden="true">↓</span>}
              </button>
            ))}
          </nav>
          {current?.self && profile && (
            <div className="leaderboard-self">
              <span>
                Ваше место <strong>#{current.self.rank}</strong>
              </span>
              <span>
                {metrics[sort].label}: <strong>{number(current.self[sort])}</strong>
              </span>
            </div>
          )}
          {!profile && (
            <p className="leaderboard-join">
              <a href="/login">Войдите в аккаунт</a>, чтобы ваши результаты попадали в рейтинг.
            </p>
          )}
          {!connected && (
            <p className="leaderboard-message" role="status">
              Нет связи с сервером. Рейтинг обновится после подключения.
            </p>
          )}
          {error && (
            <p className="leaderboard-message is-error" role="alert">
              {error}
            </p>
          )}
          {!current && !error && connected && (
            <p className="leaderboard-message" role="status">
              Загружаем рейтинг…
            </p>
          )}
          {current && current.entries.length > 0 && (
            <div className="leaderboard-table-wrap" aria-busy={pending}>
              <table className="leaderboard-table">
                <caption className="leaderboard-caption">
                  Игроки по показателю «{metrics[sort].label}», от большего к меньшему
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Место</th>
                    <th scope="col">Игрок</th>
                    {LEADERBOARD_SORTS.map((metric) => (
                      <th
                        scope="col"
                        key={metric}
                        aria-sort={sort === metric ? "descending" : undefined}
                      >
                        {metrics[metric].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.entries.map((entry) => (
                    <PlayerRow
                      key={entry.id}
                      entry={entry}
                      self={entry.id === profile?.id}
                      sort={sort}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {current?.totalPlayers === 0 && (
            <div className="leaderboard-empty">
              <FiAward aria-hidden="true" />
              <h2>Первое место пока свободно</h2>
              <p>Создайте аккаунт и сыграйте первую партию.</p>
              <a href="/login">Присоединиться →</a>
            </div>
          )}
          {current && current.totalPages > 1 && (
            <nav className="leaderboard-pagination" aria-label="Страницы рейтинга">
              <button
                type="button"
                disabled={page <= 1 || pending || !connected}
                onClick={() => setPage(page - 1)}
                aria-label="Предыдущая страница"
              >
                <FiChevronLeft />
              </button>
              <span aria-live="polite">
                {page} / {current.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= current.totalPages || pending || !connected}
                onClick={() => setPage(page + 1)}
                aria-label="Следующая страница"
              >
                <FiChevronRight />
              </button>
            </nav>
          )}
          <details className="leaderboard-rules">
            <summary>Как считается рейтинг</summary>
            <p>
              Партии и победы засчитываются аккаунтам за завершённые игры, в том числе с ботами.
              Гости, зрители, вышедшие и исключённые игроки в зачёт не попадают. Прерванные игры не
              учитываются.
            </p>
            <p>
              UNO: победитель партии. Бункер: выжившие. Дурак: игроки, вышедшие без карт; ничья не
              даёт победу.
            </p>
            <p>
              Монеты — текущий баланс. Коллекция — разные предметы без стартовых и повторных
              экземпляров. При одинаковом результате игроки делят место.
            </p>
            <p>
              В версии 6.0.0 аккаунты и рейтинг начаты заново. Данные обновляются каждые 30 секунд.
            </p>
          </details>
        </main>
        <MenuFooter />
      </div>
    </div>
  );
}
