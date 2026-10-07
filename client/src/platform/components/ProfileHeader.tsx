import type { MouseEvent } from "react";
import { FiLogIn, FiLogOut } from "react-icons/fi";
import { LuGamepad2, LuLayers, LuPackageOpen, LuSparkles, LuTrophy } from "react-icons/lu";
import { usePlatform } from "../context/PlatformContext";
import { useProfile } from "../context/ProfileContext";
import { BrandDice } from "./BrandDice";
import { DailyBonusWallet } from "./DailyBonusWallet";
import { ProfileNotifications } from "./ProfileNotifications";

interface ProfileHeaderProps {
  activePage?:
    | "games"
    | "collection"
    | "account"
    | "cases"
    | "upgrade"
    | "updates"
    | "leaderboard"
    | "stats";
  onHome?: () => void;
}

export function ProfileHeader({ activePage = "games", onHome }: ProfileHeaderProps) {
  const { profile, connected, busy, logout } = useProfile();
  const { roomCode } = usePlatform();
  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onHome || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onHome();
  };
  return (
    <header className="show-menu-header show-profile-header">
      <a className="show-brand" href="/" onClick={goHome} aria-label="PartySide — на главную">
        <BrandDice className="show-brand-dice" />
        partyside
      </a>
      <nav className="show-profile-navigation" aria-label="Профиль и коллекция">
        <a
          href="/"
          onClick={goHome}
          aria-current={activePage === "games" ? "page" : undefined}
          aria-label={roomCode ? "В комнату" : "Игры"}
          title={roomCode ? "В комнату" : "Игры"}
        >
          <LuGamepad2 aria-hidden="true" />
          <span>{roomCode ? "В комнату" : "Игры"}</span>
        </a>
        <a
          href="/collection"
          aria-current={activePage === "collection" ? "page" : undefined}
          aria-label="Коллекция"
          title="Коллекция"
        >
          <LuLayers aria-hidden="true" />
          <span>Коллекция</span>
        </a>
        <a
          href="/cases"
          aria-current={activePage === "cases" ? "page" : undefined}
          aria-label="Кейсы"
          title="Кейсы"
        >
          <LuPackageOpen aria-hidden="true" />
          <span>Кейсы</span>
        </a>
        <a
          href="/upgrade"
          aria-current={activePage === "upgrade" ? "page" : undefined}
          aria-label="Улучшить"
          title="Улучшить"
        >
          <LuSparkles aria-hidden="true" />
          <span>Улучшить</span>
        </a>
        <a
          href="/leaderboard"
          aria-current={activePage === "leaderboard" ? "page" : undefined}
          aria-label="Рейтинг"
          title="Рейтинг"
        >
          <LuTrophy aria-hidden="true" />
          <span>Рейтинг</span>
        </a>
      </nav>
      <div className="show-profile-account">
        {profile ? (
          <>
            <div className="show-profile-balance">
              <a
                className="show-profile-nickname"
                href="/account"
                title="Открыть профиль"
                aria-current={activePage === "account" ? "page" : undefined}
              >
                {profile.nickname}
              </a>
              <DailyBonusWallet key={profile.id} profile={profile} />
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
            </button>
          </>
        ) : (
          <a className="show-login" href="/login">
            <FiLogIn aria-hidden="true" /> Войти
          </a>
        )}
      </div>
      <ProfileNotifications />
    </header>
  );
}
