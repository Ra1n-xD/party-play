import type { MouseEvent } from "react";
import { FiLogIn, FiLogOut } from "react-icons/fi";
import { usePlatform } from "../context/PlatformContext";
import { useProfile } from "../context/ProfileContext";
import { BrandDice } from "./BrandDice";
import { CoinAmount } from "./CoinAmount";
import { CASE_COST, GAME_REWARD } from "../../../../shared/platform/cosmetics";

interface ProfileHeaderProps {
  activePage?: "games" | "profile" | "cases" | "upgrade";
  onHome?: () => void;
}

export function ProfileHeader({ activePage = "games", onHome }: ProfileHeaderProps) {
  const { profile, connected, busy, logout, error } = useProfile();
  const { roomCode } = usePlatform();
  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onHome || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onHome();
  };
  return (
    <header className="show-menu-header show-profile-header">
      <a className="show-brand" href="/" onClick={goHome} aria-label="PartyPlay — на главную">
        <BrandDice className="show-brand-dice" />
        partyplay
      </a>
      <nav className="show-profile-navigation" aria-label="Профиль и коллекция">
        <a href="/" onClick={goHome} aria-current={activePage === "games" ? "page" : undefined}>
          {roomCode ? "В комнату" : "Игры"}
        </a>
        <a href="/profile" aria-current={activePage === "profile" ? "page" : undefined}>
          Коллекция
        </a>
        <a href="/cases" aria-current={activePage === "cases" ? "page" : undefined}>
          Кейсы
        </a>
        <a href="/upgrade" aria-current={activePage === "upgrade" ? "page" : undefined}>
          Улучшить
        </a>
      </nav>
      {profile ? (
        <>
          <div className="show-profile-balance">
            <a href="/profile" className="show-profile-nickname">
              {profile.nickname}
            </a>
            <details className="coin-wallet">
              <summary aria-label={`Ваш баланс: ${profile.coins} монет. Как получить монеты`}>
                <CoinAmount amount={profile.coins} />
              </summary>
              <div className="coin-wallet-help">
                <strong>Монеты PartyPlay</strong>
                <p>+{GAME_REWARD} монета каждому игроку за завершённую партию в любой игре.</p>
                <p>
                  Зрители и прерванные партии без награды. Открытие кейса стоит {CASE_COST} монету.
                </p>
              </div>
            </details>
          </div>
          <button
            className="show-logout"
            type="button"
            onClick={logout}
            disabled={busy || !connected}
            aria-label="Выйти из аккаунта"
            title={roomCode ? "Выйти из аккаунта и покинуть комнату" : "Выйти из аккаунта"}
          >
            <FiLogOut aria-hidden="true" />
            <span>Выйти</span>
          </button>
        </>
      ) : (
        <a className="show-login" href="/login">
          <FiLogIn aria-hidden="true" /> Войти
        </a>
      )}
      {profile && (!connected || busy) && (
        <span className="show-profile-connection" role="status">
          {connected ? "Сохраняем…" : "Нет связи"}
        </span>
      )}
      {profile && error && (
        <span className="show-profile-connection" role="alert">
          {error}
        </span>
      )}
    </header>
  );
}
