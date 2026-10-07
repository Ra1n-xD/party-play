import { useState, type CSSProperties } from "react";
import {
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
  return (
    <main className="collection-page">
      <div className="collection-heading">
        <div>
          <h1>Ваш стиль игры</h1>
          <p>Персонажи, карты и эмоции для вашего вечера за столом.</p>
        </div>
      </div>
      <section className="profile-summary">
        <strong>{profile.nickname}</strong>
        <CoinAmount amount={profile.coins} />
        <span>
          {owned} / {COSMETICS.length} предметов
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
              <span className="cosmetic-rarity">
                {rarity.name}
                {count > 1 ? ` · ×${count}` : ""}
              </span>
              <CosmeticPreview item={item} />
              <h2>{item.name}</h2>
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
