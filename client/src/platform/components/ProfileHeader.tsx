import type { MouseEvent } from "react";
import { FiLogIn } from "react-icons/fi";
import { usePlatform } from "../context/PlatformContext";
import { useProfile } from "../context/ProfileContext";
import { BrandDice } from "./BrandDice";
import { CoinWallet } from "./CoinWallet";
import { ProfileNotifications } from "./ProfileNotifications";
import { ProfileAccountMenu } from "./ProfileAccountMenu";
import { usePetCareReminder } from "../usePetCareReminder";
import { loginHref } from "../authNavigation";
import { PlatformNavigation, type NavigationPage } from "./PlatformNavigation";

interface ProfileHeaderProps {
  activePage?: NavigationPage;
  onHome?: () => void;
}

export function ProfileHeader({ activePage = "games", onHome }: ProfileHeaderProps) {
  const { profile, loading, connected, busy, logout } = useProfile();
  const { roomCode } = usePlatform();
  const petNeedsCare = usePetCareReminder();
  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onHome || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onHome();
  };
  return (
    <header
      className={`show-menu-header show-profile-header platform-topbar${profile ? " has-account" : ""}`}
    >
      <a
        className="show-brand platform-header-brand"
        href="/"
        onClick={goHome}
        aria-label="PartySide — на главную"
      >
        <BrandDice className="show-brand-dice" />
        <span className="show-brand-name">partyside</span>
      </a>
      <PlatformNavigation
        activePage={activePage}
        inRoom={!!roomCode}
        petNeedsCare={petNeedsCare}
        onHome={goHome}
      />
      <div className="show-profile-account">
        {profile ? (
          <div className="show-profile-balance">
            <CoinWallet key={profile.id} coins={profile.coins} />
            <ProfileAccountMenu
              key={profile.id}
              nickname={profile.nickname}
              active={activePage === "account"}
              disabled={busy || !connected}
              inRoom={!!roomCode}
              onLogout={logout}
            />
          </div>
        ) : loading ? (
          <span className="show-account-loading" role="status" aria-label="Проверяем вход…" />
        ) : (
          <a
            className="show-login"
            href={loginHref(
              activePage === "account"
                ? "/profile"
                : activePage === "games"
                  ? "/"
                  : `/${activePage}`,
            )}
          >
            <FiLogIn aria-hidden="true" /> Войти
          </a>
        )}
      </div>
      <ProfileNotifications />
    </header>
  );
}
