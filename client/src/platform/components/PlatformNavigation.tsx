import { useEffect, useId, useState, type MouseEvent } from "react";
import type { IconType } from "react-icons";
import { FiClock } from "react-icons/fi";
import { ProjectLinks } from "./ProjectLinks";
import {
  LuSwords,
  LuPawPrint,
  LuGamepad2,
  LuLayers,
  LuPackageOpen,
  LuSparkles,
  LuTrophy,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuEllipsis,
  LuX,
} from "react-icons/lu";
import { useNavigation } from "../context/NavigationContext";
import { AccessibleModal } from "./AccessibleModal";
import { BrandDice } from "./BrandDice";

export type NavigationPage =
  | "games"
  | "duels"
  | "pet"
  | "collection"
  | "cases"
  | "upgrade"
  | "leaderboard"
  | "updates"
  | "account"
  | "stats";

interface NavigationItem {
  page: NavigationPage;
  href: string;
  label: string;
  icon: IconType;
}

const sections: NavigationItem[] = [
  { page: "games", href: "/", label: "Игры", icon: LuGamepad2 },
  { page: "duels", href: "/duels", label: "Дуэли", icon: LuSwords },
  { page: "pet", href: "/pet", label: "Питомец", icon: LuPawPrint },
  { page: "collection", href: "/collection", label: "Коллекция", icon: LuLayers },
  { page: "cases", href: "/cases", label: "Кейсы", icon: LuPackageOpen },
  { page: "upgrade", href: "/upgrade", label: "Улучшить", icon: LuSparkles },
  { page: "leaderboard", href: "/leaderboard", label: "Рейтинг", icon: LuTrophy },
];
const updates: NavigationItem = {
  page: "updates",
  href: "/updates",
  label: "Обновления",
  icon: FiClock,
};

export function NavigationHeading({ page }: { page: NavigationPage }) {
  const item =
    sections.find((entry) => entry.page === page) ?? (page === "updates" ? updates : null);
  const Icon = item?.icon;
  return (
    <div className="platform-navigation-heading">
      {Icon && <Icon aria-hidden="true" />}
      <span>{item?.label ?? (page === "account" ? "Профиль" : "Статистика")}</span>
    </div>
  );
}

interface PlatformNavigationProps {
  activePage: NavigationPage;
  inRoom: boolean;
  petNeedsCare: boolean;
  onHome: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function PlatformNavigation({
  activePage,
  inRoom,
  petNeedsCare,
  onHome,
}: PlatformNavigationProps) {
  const { collapsed, animate, toggleCollapsed } = useNavigation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const sidebarId = useId();
  const moreActive =
    sections.slice(4).some((item) => item.page === activePage) || activePage === "updates";

  useEffect(() => setMoreOpen(false), [activePage]);
  useEffect(() => {
    if (!moreOpen) return;
    const desktop = window.matchMedia("(min-width: 951px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMoreOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [moreOpen]);

  const link = (item: NavigationItem) => {
    const label = item.page === "games" && inRoom ? "В комнату" : item.label;
    const careDue = item.page === "pet" && petNeedsCare;
    const accessibleLabel = careDue ? "Питомец — пора покормить и поиграть" : label;
    const Icon = item.icon;
    return (
      <a
        key={item.page}
        className="platform-nav-link"
        href={item.href}
        aria-current={activePage === item.page ? "page" : undefined}
        aria-label={accessibleLabel}
        title={accessibleLabel}
        onClick={(event) => {
          if (item.page === "games") onHome(event);
          setMoreOpen(false);
        }}
      >
        <span className="platform-nav-icon">
          <Icon aria-hidden="true" />
          {careDue && <i className="pet-care-dot" aria-hidden="true" />}
        </span>
        <span className="platform-nav-label">{label}</span>
      </a>
    );
  };

  return (
    <>
      <aside
        className="platform-navigation"
        data-collapsed={collapsed}
        data-animate={animate}
        aria-label="Боковая панель"
      >
        <a
          className="platform-sidebar-brand"
          href="/"
          onClick={onHome}
          aria-label="PartySide — на главную"
          title="PartySide — на главную"
        >
          <BrandDice />
          <span>partyside</span>
        </a>
        <nav className="platform-sidebar-sections" id={sidebarId} aria-label="Разделы PartySide">
          {sections.map(link)}
        </nav>
        <div className="platform-sidebar-bottom">
          <button
            className="platform-nav-link platform-nav-collapse"
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Развернуть панель" : "Свернуть панель"}
            title={collapsed ? "Развернуть панель" : "Свернуть панель"}
            aria-expanded={!collapsed}
            aria-controls={sidebarId}
          >
            <span className="platform-nav-icon">
              {collapsed ? (
                <LuPanelLeftOpen aria-hidden="true" />
              ) : (
                <LuPanelLeftClose aria-hidden="true" />
              )}
            </span>
            <span className="platform-nav-label">Свернуть</span>
          </button>
        </div>
      </aside>
      <nav className="platform-bottom-navigation" aria-label="Разделы PartySide">
        {sections.slice(0, 4).map(link)}
        <button
          className="platform-nav-link"
          type="button"
          aria-label="Ещё разделы"
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          aria-current={moreActive ? "page" : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <span className="platform-nav-icon">
            <LuEllipsis aria-hidden="true" />
          </span>
          <span className="platform-nav-label">Ещё</span>
        </button>
      </nav>
      {moreOpen && (
        <AccessibleModal
          labelledBy={moreId}
          onClose={() => setMoreOpen(false)}
          overlayClassName="platform-more-overlay"
          panelClassName="platform-more-sheet"
        >
          <div className="platform-more-heading">
            <h2 id={moreId}>Ещё в PartySide</h2>
            <button
              type="button"
              className="platform-more-close"
              aria-label="Закрыть меню"
              onClick={() => setMoreOpen(false)}
            >
              <LuX aria-hidden="true" />
            </button>
          </div>
          <nav className="platform-more-sections" aria-label="Другие разделы">
            {sections.slice(4).map(link)}
          </nav>
          <nav className="platform-more-services" aria-label="Ссылки проекта">
            <ProjectLinks
              updatesActive={activePage === "updates"}
              inMenu
              onNavigate={() => setMoreOpen(false)}
            />
          </nav>
        </AccessibleModal>
      )}
    </>
  );
}
