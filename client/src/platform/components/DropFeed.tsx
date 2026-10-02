import { useEffect, useState, type CSSProperties } from "react";
import { FiPackage, FiTrendingUp } from "react-icons/fi";
import { COSMETIC_KIND_NAMES, RARITIES, getCosmetic } from "../../../../shared/platform/cosmetics";
import { DROP_FEED_LIMIT, type CosmeticDrop } from "../../../../shared/platform/dropFeed";
import { socket } from "../../socket";
import { useProfile } from "../context/ProfileContext";
import { CosmeticPreview } from "./CosmeticPreview";
import "../../styles/drop-feed.css";

export function DropFeed({ holdUpdates = false }: { holdUpdates?: boolean }) {
  const { connected } = useProfile();
  const [drops, setDrops] = useState<CosmeticDrop[]>([]);
  const [visibleDrops, setVisibleDrops] = useState<CosmeticDrop[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!connected) return;
    const receive = (snapshot: CosmeticDrop[]) => {
      setDrops(snapshot.filter((entry) => getCosmetic(entry.itemId)).slice(0, DROP_FEED_LIMIT));
      setLoaded(true);
    };
    socket.on("drops:snapshot", receive);
    socket.emit("drops:subscribe");
    return () => {
      socket.off("drops:snapshot", receive);
      if (socket.connected) socket.emit("drops:unsubscribe");
    };
  }, [connected]);

  useEffect(() => {
    if (!holdUpdates) setVisibleDrops(drops);
  }, [drops, holdUpdates]);

  return (
    <section className="drop-feed" aria-label="Последние выпадения игроков">
      <div className="drop-feed-heading">
        <span className={`drop-feed-live${connected ? " is-online" : ""}`}>
          <i aria-hidden="true" /> Лента выпадений
        </span>
        <small>Кейсы и улучшения</small>
      </div>
      {visibleDrops.length ? (
        <ol className="drop-feed-track" tabIndex={0} aria-label="Прокручиваемая лента наград">
          {visibleDrops.map((drop) => {
            const item = getCosmetic(drop.itemId)!;
            return (
              <li
                className="drop-feed-item"
                key={drop.id}
                style={{ "--drop-color": RARITIES[item.rarity].color } as CSSProperties}
                title={`${drop.nickname} · ${item.name} · ${COSMETIC_KIND_NAMES[item.kind]} · ${new Date(drop.createdAt).toLocaleString("ru-RU")}`}
              >
                <div className="drop-feed-preview" aria-hidden="true">
                  <CosmeticPreview item={item} />
                </div>
                <div className="drop-feed-copy">
                  <span className="drop-feed-nickname">{drop.nickname}</span>
                  <strong>{item.name}</strong>
                  <small>{COSMETIC_KIND_NAMES[item.kind]}</small>
                  <span className="drop-feed-source">
                    {drop.source === "case" ? (
                      <FiPackage aria-hidden="true" />
                    ) : (
                      <FiTrendingUp aria-hidden="true" />
                    )}
                    {drop.source === "case" ? "Кейс" : "Улучшение"}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="drop-feed-empty" role="status">
          {!connected || !loaded
            ? "Подключаем ленту…"
            : "Пока выпадений нет. Откройте первый кейс!"}
        </p>
      )}
    </section>
  );
}
