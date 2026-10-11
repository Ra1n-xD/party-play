import { useEffect } from "react";
import { FiGift, FiX } from "react-icons/fi";
import { announcedRelease, useReleaseNews } from "../context/ReleaseNewsContext";
import type { ReleaseSection } from "../releaseHighlights";
import { AccessibleModal } from "./AccessibleModal";
import "../../styles/release-announcement.css";

const sectionPages: Record<ReleaseSection, { path: string; label: string }> = {
  games: { path: "/", label: "Каталог игр" },
  duels: { path: "/duels", label: "Дуэли" },
  collection: { path: "/collection", label: "Мои предметы" },
  cases: { path: "/cases", label: "Кейсы" },
  upgrade: { path: "/upgrade", label: "Улучшения" },
  pet: { path: "/pet", label: "Питомец" },
  leaderboard: { path: "/leaderboard", label: "Рейтинг" },
};

export function ReleaseAnnouncement({ path, enabled }: { path: string; enabled: boolean }) {
  const { ready, dismissed, dismiss, visit } = useReleaseNews();
  useEffect(() => {
    if (!ready || !dismissed || !enabled) return;
    const section = (Object.keys(sectionPages) as ReleaseSection[]).find(
      (key) => sectionPages[key].path === path,
    );
    if (section) visit(section);
  }, [ready, dismissed, enabled, path, visit]);
  if (!announcedRelease || !ready || dismissed || !enabled) return null;
  const screenshot = announcedRelease.screenshots[0];
  return (
    <AccessibleModal
      labelledBy="release-announcement-title"
      onClose={dismiss}
      dismissible={false}
      panelClassName="party-dialog release-announcement"
      overlayClassName="release-announcement-overlay"
    >
      <header className="release-announcement-header">
        <span>
          <FiGift aria-hidden="true" /> Новое в PartySide <b>{announcedRelease.version}</b>
        </span>
        <button
          className="release-announcement-close"
          type="button"
          onClick={dismiss}
          aria-label="Закрыть окно обновления"
        >
          <FiX aria-hidden="true" />
        </button>
      </header>
      <div className="release-announcement-body">
        <p className="release-announcement-category">{announcedRelease.category}</p>
        <h2 id="release-announcement-title">{announcedRelease.title}</h2>
        <p className="release-announcement-summary">{announcedRelease.summary}</p>
        {screenshot && (
          <img
            className="release-announcement-image"
            src={screenshot.src}
            width={screenshot.width}
            height={screenshot.height}
            alt={screenshot.alt}
          />
        )}
        <ul>
          {announcedRelease.changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
        <div className="release-announcement-sections">
          <span>Где попробовать</span>
          <div>
            {announcedRelease.announcement?.sections.map((section) => (
              <strong key={section}>
                <i aria-hidden="true" />
                {sectionPages[section].label}
              </strong>
            ))}
          </div>
        </div>
        <p className="release-announcement-hint">
          Красная точка в меню исчезнет после посещения раздела. История изменений — во вкладке
          «Обновления».
        </p>
      </div>
    </AccessibleModal>
  );
}
