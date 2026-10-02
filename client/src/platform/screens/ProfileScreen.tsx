import { useState, type CSSProperties, type FormEvent } from "react";
import {
  COSMETICS,
  COSMETIC_KIND_NAMES,
  RARITIES,
  INITIAL_COINS,
  type CosmeticKind,
} from "../../../../shared/platform/cosmetics";
import { useProfile } from "../context/ProfileContext";
import { CosmeticPreview } from "../components/CosmeticPreview";
import { CoinAmount } from "../components/CoinAmount";

export function LoginScreen() {
  const { login, busy, connected, error } = useProfile();
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    login(name);
  };
  return (
    <main className="profile-login">
      <a href="/" className="profile-logo">
        partyplay<span> / CLUB</span>
      </a>
      <section>
        <span className="profile-eyebrow">ВАШ ПРОФИЛЬ</span>
        <h1>
          Свой ник.
          <br />
          Свой стиль.
        </h1>
        <p>Введите никнейм, чтобы сохранить персонажа, карты и коллекцию.</p>
        <form onSubmit={submit}>
          <label htmlFor="profile-nickname">Никнейм</label>
          <input
            id="profile-nickname"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            autoComplete="nickname"
            placeholder="Ваш никнейм"
            autoFocus
            disabled={busy}
          />
          <button className="profile-primary" disabled={busy || !connected || !name.trim()}>
            {busy ? "Входим…" : "Войти по нику →"}
          </button>
        </form>
        <div className="profile-welcome">
          <span className="profile-welcome-coins">
            <CoinAmount amount={INITIAL_COINS} label="монет новому игроку" />
          </span>
        </div>
        <small>
          Временные профили без пароля. Доступ есть у каждого, кто знает ник. При переходе на БД
          коллекции будут сброшены.
        </small>
        {error && (
          <p className="profile-error" role="alert">
            {error}
          </p>
        )}
        {!connected && <p role="status">Подключаемся к серверу…</p>}
      </section>
    </main>
  );
}
export function ProfileScreen() {
  const { profile, equip, logout, busy, connected, error } = useProfile();
  const [tab, setTab] = useState<CosmeticKind>("avatar");
  if (!profile) return null;
  const owned = COSMETICS.filter((item) => profile.inventory[item.id]).length;
  return (
    <main className="collection-page">
      <div className="collection-heading">
        <div>
          <span className="profile-eyebrow">КОЛЛЕКЦИЯ</span>
          <h1>Ваш стиль игры</h1>
          <p>Персонажи и карты, которые узнают за любым столом.</p>
        </div>
        <a href="/cases" className="profile-primary">
          Открыть кейс ↗
        </a>
      </div>
      <section className="profile-summary">
        <strong>{profile.nickname}</strong>
        <CoinAmount amount={profile.coins} />
        <span>
          {owned} / {COSMETICS.length} предметов
        </span>
        <span>{profile.completedGames} завершённых партий</span>
        <button onClick={logout} disabled={busy || !connected} className="profile-text-button">
          Выйти из аккаунта
        </button>
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
      {error && (
        <p className="profile-error" role="alert">
          {error}
        </p>
      )}
      <div className="collection-grid">
        {COSMETICS.filter((item) => item.kind === tab).map((item) => {
          const count = profile.inventory[item.id] ?? 0;
          const selected = `${item.kind}:${profile.equipped[item.kind]}` === item.id;
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
                {selected ? "✓ Выбран" : count ? "Выбрать" : "В кейсе"}
              </button>
            </article>
          );
        })}
      </div>
    </main>
  );
}
