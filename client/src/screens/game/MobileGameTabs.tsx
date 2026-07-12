import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { MobileGameTab } from "./gameScreenViewModel";

interface MobileGameTabsProps {
  activeTab: MobileGameTab;
  showCharacter: boolean;
  onChange: (tab: MobileGameTab) => void;
  players: ReactNode;
  character: ReactNode;
  situation: ReactNode;
}

const tabs: { id: MobileGameTab; label: string }[] = [
  { id: "players", label: "Игроки" },
  { id: "character", label: "Персонаж" },
  { id: "situation", label: "Ситуация" },
];

type TabNavigationKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

export function getNextMobileTab(
  visibleTabs: readonly MobileGameTab[],
  currentTab: MobileGameTab,
  key: TabNavigationKey,
): MobileGameTab {
  if (visibleTabs.length === 0) return "players";
  const currentIndex = Math.max(0, visibleTabs.indexOf(currentTab));
  if (key === "Home") return visibleTabs[0];
  if (key === "End") return visibleTabs[visibleTabs.length - 1];
  const offset = key === "ArrowRight" ? 1 : -1;
  return visibleTabs[(currentIndex + offset + visibleTabs.length) % visibleTabs.length];
}

export function MobileGameTabs({
  activeTab,
  showCharacter,
  onChange,
  players,
  character,
  situation,
}: MobileGameTabsProps) {
  const visibleTabs = tabs.filter((tab) => showCharacter || tab.id !== "character");
  const visibleTabIds = visibleTabs.map((tab) => tab.id);
  const selectedTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : "players";
  const tabRefs = useRef<Partial<Record<MobileGameTab, HTMLButtonElement | null>>>({});
  const panels: Record<MobileGameTab, ReactNode> = {
    players,
    character,
    situation,
  };

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentTab: MobileGameTab,
  ) => {
    if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const nextTab = getNextMobileTab(visibleTabIds, currentTab, event.key as TabNavigationKey);
    onChange(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div>
      <div role="tablist">
        {visibleTabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`gs-mobile-tab-${id}`}
            aria-controls={`gs-mobile-panel-${id}`}
            aria-selected={selectedTab === id}
            tabIndex={selectedTab === id ? 0 : -1}
            ref={(element) => {
              tabRefs.current[id] = element;
            }}
            onClick={() => onChange(id)}
            onKeyDown={(event) => handleKeyDown(event, id)}
          >
            {label}
          </button>
        ))}
      </div>

      {visibleTabs.map(({ id }) => (
        <div
          key={id}
          role="tabpanel"
          id={`gs-mobile-panel-${id}`}
          aria-labelledby={`gs-mobile-tab-${id}`}
          hidden={selectedTab !== id}
        >
          {panels[id]}
        </div>
      ))}
    </div>
  );
}
