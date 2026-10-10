import { getUpgradeInputValue } from "../../../../shared/platform/upgrades";
import { useState, type CSSProperties } from "react";
import {
  BASIC_ITEMS,
  COSMETICS,
  COSMETIC_KIND_NAMES,
  RARITIES,
  isCosmeticInUse,
  type CosmeticKind,
} from "../../../../shared/platform/cosmetics";
import { useProfile } from "../context/ProfileContext";
import { CosmeticPreview } from "../components/CosmeticPreview";
import { CoinAmount } from "../components/CoinAmount";

export function CollectionScreen() {
  const { profile, equip, busy, connected } = useProfile();
  const [tab, setTab] = useState<CosmeticKind>("avatar");
  if (!profile) return null;
  const owned = COSMETICS.filter((item) => profile.inventory[item.id]).length;
  const totalCopies = COSMETICS.reduce((sum, item) => sum + (profile.inventory[item.id] ?? 0), 0);
  return (
    <main className="collection-page">
      <div className="collection-heading">
        <div>
          <h1>Мои предметы</h1>
          <p>Персонажи, карты и эмоции для вашего вечера за столом.</p>
        </div>
      </div>
      <section className="profile-summary">
        <strong>{profile.nickname}</strong>
        <CoinAmount amount={profile.coins} />
        <span>
          Собрано видов: {owned} из {COSMETICS.length}
        </span>
        <span>Всего предметов: {totalCopies.toLocaleString("ru-RU")} шт.</span>
        <span>
          {getUpgradeInputValue(
            Object.entries(profile.inventory)
              .filter(([id]) => !BASIC_ITEMS.includes(id))
              .map(([itemId, count]) => ({ itemId, count })),
          ).toLocaleString("ru-RU")}{" "}
          ед. ценности коллекции
        </span>
        <span>
          {profile.completedGames} завершённых партий · {profile.wins} побед
        </span>
      </section>
      <nav className="collection-tabs" aria-label="Тип предметов">
        {Object.entries(COSMETIC_KIND_NAMES).map(([kind, name]) => (
          <button
            key={kind}
            aria-pressed={tab === kind}
            onClick={() => setTab(kind as CosmeticKind)}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className="collection-grid">
        {COSMETICS.filter((item) => item.kind === tab).map((item) => {
          const count = profile.inventory[item.id] ?? 0;
          const selected = isCosmeticInUse(profile, item);
          const rarity = RARITIES[item.rarity];
          return (
            <article
              className={`collection-item${count ? "" : " is-locked"}${selected ? " is-equipped" : ""}`}
              key={item.id}
              style={{ "--rarity-color": rarity.color } as CSSProperties}
            >
              <span className="cosmetic-rarity">{rarity.name}</span>
              <CosmeticPreview item={item} />
              <h2>{item.name}</h2>
              <p className="collection-item-count">
                <span>В наличии:</span> <strong>{count.toLocaleString("ru-RU")} шт.</strong>
              </p>
              <button
                className="collection-equip"
                onClick={() => equip(item.id)}
                disabled={!count || selected || busy || !connected}
              >
                {selected
                  ? item.kind === "reaction"
                    ? "✓ Доступна в игре"
                    : "✓ Выбран"
                  : count
                    ? "Выбрать"
                    : "В кейсе"}
              </button>
            </article>
          );
        })}
      </div>
    </main>
  );
}
