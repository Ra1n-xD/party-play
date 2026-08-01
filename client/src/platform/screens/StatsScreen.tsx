import { useEffect, useMemo, useState } from "react";
import type { ProjectStatsSnapshot } from "../../../../shared/platform/projectStats";
import { socket } from "../../socket";
import { clientGameRegistry } from "../gameRegistry";

const numberFormatter = new Intl.NumberFormat("ru-RU");

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(value);
}

export function StatsScreen() {
  const [stats, setStats] = useState<ProjectStatsSnapshot | null>(null);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const subscribe = () => {
      setConnected(true);
      socket.emit("stats:subscribe");
    };
    const handleDisconnect = () => setConnected(false);
    const handleSnapshot = (snapshot: ProjectStatsSnapshot) => setStats(snapshot);

    socket.on("connect", subscribe);
    socket.on("disconnect", handleDisconnect);
    socket.on("stats:snapshot", handleSnapshot);
    if (socket.connected) subscribe();
    else socket.connect();

    return () => {
      if (socket.connected) socket.emit("stats:unsubscribe");
      socket.off("connect", subscribe);
      socket.off("disconnect", handleDisconnect);
      socket.off("stats:snapshot", handleSnapshot);
    };
  }, []);

  const completionRate = useMemo(() => {
    if (!stats?.totals.gamesStarted) return 0;
    return Math.round((stats.totals.gamesCompleted / stats.totals.gamesStarted) * 100);
  }, [stats]);

  return (
    <main className="platform-stats">
      <div className="platform-stats-shell">
        <header className="platform-stats-header">
          <a className="platform-home-brand" href="/" aria-label="PartyPlay — на главную">
            <span aria-hidden="true">◆</span>
            PartyPlay
          </a>
          <a className="platform-stats-back" href="/">
            На главную
          </a>
        </header>

        <section className="platform-stats-hero" aria-labelledby="project-stats-title">
          <div>
            <p>Статистика проекта</p>
            <h1 id="project-stats-title">Насколько востребован PartyPlay</h1>
          </div>
          <span
            className={`platform-stats-connection${connected ? " is-online" : " is-offline"}`}
            role="status"
          >
            {connected ? "Данные обновляются" : "Соединение потеряно"}
          </span>
        </section>

        {!stats ? (
          <div className="platform-stats-state" role="status">
            {connected ? "Загружаем статистику…" : "Статистика временно недоступна"}
          </div>
        ) : (
          <>
            {!connected && (
              <div className="platform-stats-state is-stale" role="status">
                Показаны последние полученные данные.
              </div>
            )}

            <section className="platform-stats-section" aria-labelledby="stats-total-title">
              <div className="platform-stats-section-heading">
                <div>
                  <span>За всё время наблюдения</span>
                  <h2 id="stats-total-title">Основные показатели</h2>
                </div>
                <small>Сбор начат {formatDate(stats.trackingStartedAt)}</small>
              </div>
              <div className="platform-stats-grid">
                <article>
                  <span>Уникальных устройств</span>
                  <strong>{formatNumber(stats.totals.uniquePlayerDevices)}</strong>
                  <small>Приблизительная оценка числа игроков</small>
                </article>
                <article>
                  <span>Игровых участий</span>
                  <strong>{formatNumber(stats.totals.playerEntries)}</strong>
                  <small>Создания комнат и входы игроков</small>
                </article>
                <article>
                  <span>Создано комнат</span>
                  <strong>{formatNumber(stats.totals.roomsCreated)}</strong>
                  <small>Открытых: {formatNumber(stats.totals.publicRoomsCreated)}</small>
                </article>
                <article>
                  <span>Запущено партий</span>
                  <strong>{formatNumber(stats.totals.gamesStarted)}</strong>
                  <small>Завершено: {formatNumber(stats.totals.gamesCompleted)}</small>
                </article>
                <article>
                  <span>Дошли до результата</span>
                  <strong>{completionRate}%</strong>
                  <small>От всех запущенных партий</small>
                </article>
                <article>
                  <span>Входов зрителей</span>
                  <strong>{formatNumber(stats.totals.spectatorEntries)}</strong>
                  <small>Подключения в режиме наблюдения</small>
                </article>
              </div>
            </section>

            <section className="platform-stats-section" aria-labelledby="stats-live-title">
              <div className="platform-stats-section-heading">
                <div>
                  <span>Прямо сейчас</span>
                  <h2 id="stats-live-title">Live-состояние</h2>
                </div>
                <small>Обновлено {formatDate(stats.generatedAt)}</small>
              </div>
              <div className="platform-stats-live">
                <span>
                  <strong>{formatNumber(stats.live.connectedPlayers)}</strong> игроков онлайн
                </span>
                <span>
                  <strong>{formatNumber(stats.live.rooms)}</strong> комнат
                </span>
                <span>
                  <strong>{formatNumber(stats.live.publicRooms)}</strong> открытых
                </span>
                <span>
                  <strong>{formatNumber(stats.live.connectedSpectators)}</strong> зрителей
                </span>
              </div>
            </section>

            <section className="platform-stats-section" aria-labelledby="stats-games-title">
              <div className="platform-stats-section-heading">
                <div>
                  <span>По отдельным играм</span>
                  <h2 id="stats-games-title">Популярность игр</h2>
                </div>
              </div>
              <div className="platform-stats-games">
                {Object.values(clientGameRegistry).map((game) => {
                  const gameStats = stats.byGame[game.id];
                  return (
                    <article key={game.id}>
                      <div>
                        <strong>{game.metadata.title}</strong>
                        <span>{formatNumber(gameStats.live.connectedPlayers)} сейчас</span>
                      </div>
                      <dl>
                        <div>
                          <dt>Устройств</dt>
                          <dd>{formatNumber(gameStats.totals.uniquePlayerDevices)}</dd>
                        </div>
                        <div>
                          <dt>Комнат</dt>
                          <dd>{formatNumber(gameStats.totals.roomsCreated)}</dd>
                        </div>
                        <div>
                          <dt>Участий</dt>
                          <dd>{formatNumber(gameStats.totals.playerEntries)}</dd>
                        </div>
                        <div>
                          <dt>Партий</dt>
                          <dd>{formatNumber(gameStats.totals.gamesStarted)}</dd>
                        </div>
                        <div>
                          <dt>Завершено</dt>
                          <dd>{formatNumber(gameStats.totals.gamesCompleted)}</dd>
                        </div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            </section>

            <p className="platform-stats-privacy">
              Статистика не хранит имена, коды комнат, IP-адреса, карты или игровые состояния.
              Уникальное устройство определяется по случайному локальному идентификатору браузера.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
