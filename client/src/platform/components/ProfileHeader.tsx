import type { MouseEvent } from "react";
import { usePlatform } from "../context/PlatformContext";
import { useProfile } from "../context/ProfileContext";
import { BrandDice } from "./BrandDice";

interface ProfileHeaderProps {
  activePage?: "games" | "profile" | "cases";
  onHome?: () => void;
}

export function ProfileHeader({ activePage = "games", onHome }: ProfileHeaderProps) {
  const { profile, connected, busy } = useProfile();
  const { roomCode } = usePlatform();
  if (!profile) return null;
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
      </nav>
      <a href="/profile" className="show-profile-balance">
        <span>{profile.nickname}</span>
        <strong>◉ {profile.coins}</strong>
      </a>
      {(!connected || busy) && (
        <span className="show-profile-connection" role="status">
          {connected ? "Сохраняем…" : "Нет связи"}
        </span>
      )}
    </header>
  );
}
