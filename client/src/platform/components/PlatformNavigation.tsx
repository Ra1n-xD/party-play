import { useEffect, useId, useRef, type MouseEvent } from "react";
import type { IconType } from "react-icons";
import {
  LuArrowUpRight,
  LuChevronDown,
  LuGamepad2,
  LuLayers,
  LuPackageOpen,
  LuPawPrint,
  LuSparkles,
  LuSwords,
  LuTrophy,
} from "react-icons/lu";

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
  description: string;
  icon: IconType;
}

const groups = [
  {
    id: "games",
    label: "Игры",
    icon: LuGamepad2,
    items: [
      {
        page: "games",
        href: "/",
        label: "Каталог игр",
        description: "Бункер, Дурак и UNO",
        icon: LuGamepad2,
      },
      {
        page: "duels",
        href: "/duels",
        label: "Дуэли",
        description: "Найди пару и Морской бой",
        icon: LuSwords,
      },
    ],
  },
  {
    id: "collection",
    label: "Коллекция",
    icon: LuLayers,
    items: [
      {
        page: "collection",
        href: "/collection",
        label: "Предметы",
        description: "Ваши карты, столы и персонажи",
        icon: LuLayers,
      },
      {
        page: "cases",
        href: "/cases",
        label: "Кейсы",
        description: "Пополните коллекцию",
        icon: LuPackageOpen,
      },
      {
        page: "upgrade",
        href: "/upgrade",
        label: "Улучшения",
        description: "Обменивайте предметы на более редкие",
        icon: LuSparkles,
      },
    ],
  },
] satisfies { id: string; label: string; icon: IconType; items: NavigationItem[] }[];

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
  const navigationRef = useRef<HTMLElement>(null);
  const hoverOpenedRef = useRef<HTMLDetailsElement | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const navigationId = useId();
  const cancelHoverClose = () => {
    if (hoverCloseTimerRef.current === null) return;
    window.clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = null;
  };
  const closeGroups = (except?: HTMLDetailsElement) => {
    cancelHoverClose();
    if (hoverOpenedRef.current !== except) hoverOpenedRef.current = null;
    navigationRef.current?.querySelectorAll("details[open]").forEach((group) => {
      if (group !== except) group.removeAttribute("open");
    });
  };

  useEffect(() => closeGroups(), [activePage]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !navigationRef.current?.contains(event.target)) {
        closeGroups();
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const group = navigationRef.current?.querySelector("details[open]");
      if (!group) return;
      event.preventDefault();
      closeGroups();
      group.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      cancelHoverClose();
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  return (
    <nav
      ref={navigationRef}
      className="platform-header-navigation"
      aria-label="Разделы PartySide"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeGroups();
      }}
    >
      {groups.map((group) => {
        const Icon = group.icon;
        const active = group.items.some((item) => item.page === activePage);
        const dropdownId = `${navigationId}-${group.id}`;
        return (
          <details
            className="platform-nav-group"
            key={group.id}
            name={navigationId}
            onPointerEnter={(event) => {
              if (
                event.pointerType !== "mouse" ||
                !window.matchMedia("(hover: hover) and (pointer: fine)").matches
              )
                return;
              const details = event.currentTarget;
              closeGroups(details);
              if (!details.open) hoverOpenedRef.current = details;
              details.open = true;
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== "mouse") return;
              const details = event.currentTarget;
              cancelHoverClose();
              if (details.contains(document.activeElement)) return;
              hoverCloseTimerRef.current = window.setTimeout(() => {
                hoverCloseTimerRef.current = null;
                if (details.contains(document.activeElement)) return;
                details.open = false;
                if (hoverOpenedRef.current === details) hoverOpenedRef.current = null;
              }, 250);
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            }}
          >
            <summary
              className="platform-nav-control"
              data-active={active || undefined}
              aria-controls={dropdownId}
              onClick={(event) => {
                const details = event.currentTarget.parentElement as HTMLDetailsElement;
                closeGroups(details);
                // The first mouse click keeps a hover-opened group available for selection.
                if (event.detail > 0 && hoverOpenedRef.current === details) event.preventDefault();
                hoverOpenedRef.current = null;
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown") return;
                event.preventDefault();
                const details = event.currentTarget.parentElement as HTMLDetailsElement;
                closeGroups(details);
                details.open = true;
                details.querySelector("a")?.focus();
              }}
            >
              <span className="platform-nav-icon">
                <Icon aria-hidden="true" />
              </span>
              <span className="platform-nav-label">{group.label}</span>
              <LuChevronDown className="platform-nav-chevron" aria-hidden="true" />
            </summary>
            <div className="platform-nav-dropdown" id={dropdownId}>
              {group.items.map((item) => {
                const ItemIcon = item.icon;
                const returnToRoom = item.page === "games" && inRoom;
                return (
                  <a
                    key={item.page}
                    href={item.href}
                    aria-current={activePage === item.page ? "page" : undefined}
                    onClick={(event) => {
                      if (item.page === "games") onHome(event);
                      closeGroups();
                    }}
                  >
                    <span className="platform-nav-item-icon">
                      <ItemIcon aria-hidden="true" />
                    </span>
                    <span className="platform-nav-item-copy">
                      <strong>{returnToRoom ? "В комнату" : item.label}</strong>
                      <small>{returnToRoom ? "Продолжить текущую партию" : item.description}</small>
                    </span>
                    <LuArrowUpRight className="platform-nav-arrow" aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          </details>
        );
      })}
      <a
        className="platform-nav-control"
        href="/pet"
        aria-current={activePage === "pet" ? "page" : undefined}
        aria-label={petNeedsCare ? "Питомец — пора покормить и поиграть" : undefined}
        title={petNeedsCare ? "Питомец — пора покормить и поиграть" : undefined}
        onClick={() => closeGroups()}
      >
        <span className="platform-nav-icon">
          <LuPawPrint aria-hidden="true" />
          {petNeedsCare && <i className="pet-care-dot" aria-hidden="true" />}
        </span>
        <span className="platform-nav-label">Питомец</span>
      </a>
      <a
        className="platform-nav-control"
        href="/leaderboard"
        aria-current={activePage === "leaderboard" ? "page" : undefined}
        onClick={() => closeGroups()}
      >
        <span className="platform-nav-icon">
          <LuTrophy aria-hidden="true" />
        </span>
        <span className="platform-nav-label">Рейтинг</span>
      </a>
    </nav>
  );
}
