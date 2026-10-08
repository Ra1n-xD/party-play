import type { MouseEvent } from "react";
import { FiLogIn } from "react-icons/fi";
import { usePlatform } from "../context/PlatformContext";
import { useProfile } from "../context/ProfileContext";
import { BrandDice } from "./BrandDice";
import { CoinAmount } from "./CoinAmount";
import { ProfileNotifications } from "./ProfileNotifications";
import { ProfileAccountMenu } from "./ProfileAccountMenu";
import { usePetCareReminder } from "../usePetCareReminder";
import { loginHref } from "../authNavigation";
import { PlatformNavigation, NavigationHeading, type NavigationPage } from "./PlatformNavigation";

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
        className="show-brand platform-mobile-brand"
        href="/"
        onClick={goHome}
        aria-label="PartySide — на главную"
      >
        <BrandDice className="show-brand-dice" />
        <span className="show-brand-name">partyside</span>
      </a>
      <NavigationHeading page={activePage} />
      <PlatformNavigation
        activePage={activePage}
        inRoom={!!roomCode}
        petNeedsCare={petNeedsCare}
        onHome={goHome}
      />
      <div className="show-profile-account">
        {profile ? (
          <div className="show-profile-balance">
            <a
              href="/pet"
              className="coin-wallet"
              aria-label={`Монет на балансе: ${profile.coins}. Уход за питомцем`}
            >
              <CoinAmount amount={profile.coins} label="" />
            </a>
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
