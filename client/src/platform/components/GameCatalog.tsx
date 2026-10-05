import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { FiArrowRight, FiBookOpen, FiChevronLeft, FiChevronRight, FiUsers } from "react-icons/fi";
import type { PublicRoomCountsByGame } from "../../../../shared/platform/publicRooms";
import type { ClientGameModule, RegisteredClientGameId } from "../gameRegistry";
import { GameMenuArtwork } from "./GameMenuArtwork";

const upcomingGames = [
  { id: "liar-dice", title: "Кости лжеца" },
  { id: "who-am-i", title: "Кто я" },
  { id: "alias", title: "Алиас" },
] as const;

interface GameCatalogProps {
  games: readonly ClientGameModule<RegisteredClientGameId>[];
  counts?: PublicRoomCountsByGame;
  onPlay: (gameId: RegisteredClientGameId) => void;
  onRooms: (gameId: RegisteredClientGameId) => void;
  onRules: (gameId: RegisteredClientGameId) => void;
}

export function GameCatalog({ games, counts, onPlay, onRooms, onRules }: GameCatalogProps) {
  const gridRef = useRef<HTMLUListElement>(null);
  const [layout, setLayout] = useState({ pageSize: 6, rows: 2 });
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const desktop = window.matchMedia("(min-width: 901px)");
    const update = () => {
      let next = { pageSize: 6, rows: 2 };
      if (desktop.matches) {
        const style = getComputedStyle(grid);
        const columns = style.gridTemplateColumns.split(" ").length;
        const unit = parseFloat(style.fontSize) / 14;
        const rows = grid.clientHeight >= 2 * 160 * unit + parseFloat(style.rowGap) ? 2 : 1;
        next = { pageSize: columns * rows, rows };
      }
      setLayout((current) =>
        current.pageSize === next.pageSize && current.rows === next.rows ? current : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    desktop.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", update);
    };
  }, []);

  const entries = [
    ...games.map((game) => ({ kind: "available" as const, id: game.id, game })),
    ...upcomingGames.map((game) => ({ kind: "soon" as const, id: game.id, game })),
  ];
  const pageCount = Math.ceil(entries.length / layout.pageSize);
  const currentPage = Math.min(page, pageCount - 1);
  useEffect(() => setPage((value) => Math.min(value, pageCount - 1)), [pageCount]);

  return (
    <section className="show-catalog" aria-label="Каталог игр">
      <ul
        ref={gridRef}
        className="show-catalog-grid"
        style={{ "--catalog-rows": layout.rows } as CSSProperties}
        aria-label="Игры"
      >
        {entries
          .slice(currentPage * layout.pageSize, (currentPage + 1) * layout.pageSize)
          .map((entry) => {
            if (entry.kind === "soon") {
              return (
                <li className="show-catalog-card is-coming" key={entry.id}>
                  <div className="show-catalog-art" data-game={entry.id}>
                    <GameMenuArtwork gameId={entry.id} />
                  </div>
                  <div className="show-catalog-coming-copy">
                    <strong>{entry.game.title}</strong>
                    <span className="show-catalog-soon">Скоро</span>
                  </div>
                </li>
              );
            }
            const { game } = entry;
            const roomCount = counts?.[game.id].publicRooms;
            return (
              <li className="show-catalog-card" key={entry.id}>
                <button
                  type="button"
                  className="show-catalog-play"
                  onClick={() => onPlay(game.id)}
                  aria-label={`Играть в ${game.metadata.title}`}
                >
                  <div className="show-catalog-art" data-game={game.id}>
                    <GameMenuArtwork gameId={game.id} />
                  </div>
                  <span className="show-catalog-heading">
                    <strong>{game.metadata.title}</strong>
                    <small>
                      {game.metadata.minPlayers}–{game.metadata.maxPlayers} игроков
                    </small>
                  </span>
                  <span className="show-catalog-play-label">
                    Играть <FiArrowRight aria-hidden="true" />
                  </span>
                </button>
                <div className="show-catalog-actions">
                  <button
                    type="button"
                    onClick={() => onRooms(game.id)}
                    aria-haspopup="dialog"
                    aria-label={`Открытые комнаты — ${game.metadata.title}${roomCount === undefined ? "" : `: ${roomCount}`}`}
                  >
                    <FiUsers aria-hidden="true" /> Комнаты
                    {roomCount !== undefined && <span>{roomCount}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRules(game.id)}
                    aria-haspopup="dialog"
                    aria-label={`Правила — ${game.metadata.title}`}
                  >
                    <FiBookOpen aria-hidden="true" /> Правила
                  </button>
                  <a href={`/games/${game.id}`} aria-label={`Об игре ${game.metadata.title}`}>
                    Об игре
                  </a>
                </div>
              </li>
            );
          })}
      </ul>
      <nav className="show-catalog-pagination" aria-label="Страницы каталога игр">
        <div>
          <button
            type="button"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 0}
            aria-label="Предыдущие игры"
          >
            <FiChevronLeft aria-hidden="true" />
          </button>
          <span role="status" aria-live="polite" aria-atomic="true">
            <span className="show-catalog-sr-only">Страница </span>
            {currentPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage === pageCount - 1}
            aria-label="Следующие игры"
          >
            <FiChevronRight aria-hidden="true" />
          </button>
        </div>
        <span>Игр в каталоге: {games.length}</span>
      </nav>
    </section>
  );
}
