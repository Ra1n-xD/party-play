import type { MouseEvent } from "react";
import { FiLogIn } from "react-icons/fi";
import { LuGamepad2, LuLayers, LuPackageOpen, LuSparkles, LuTrophy } from "react-icons/lu";
import { usePlatform } from "../context/PlatformContext";
import { useProfile } from "../context/ProfileContext";
import { BrandDice } from "./BrandDice";
import { DailyBonusWallet } from "./DailyBonusWallet";
import { ProfileNotifications } from "./ProfileNotifications";
import { ProfileAccountMenu } from "./ProfileAccountMenu";

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
    <header className={`show-menu-header show-profile-header${profile ? " has-account" : ""}`}>
      <a className="show-brand" href="/" onClick={goHome} aria-label="PartySide — на главную">
        <BrandDice className="show-brand-dice" />
        <span className="show-brand-name">partyside</span>
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
          <div className="show-profile-balance">
            <ProfileAccountMenu
              key={profile.id}
              nickname={profile.nickname}
              active={activePage === "account"}
              disabled={busy || !connected}
              inRoom={!!roomCode}
              onLogout={logout}
            />
            <DailyBonusWallet key={profile.id} profile={profile} />
          </div>
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
