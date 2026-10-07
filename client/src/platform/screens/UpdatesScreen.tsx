import { useState } from "react";
import { createPortal } from "react-dom";
import { FiArrowLeft, FiMaximize2, FiX } from "react-icons/fi";
import { AccessibleModal } from "../components/AccessibleModal";
import { MenuFooter } from "../components/MenuFooter";
import { ProfileHeader } from "../components/ProfileHeader";
import { releaseHighlights, type ReleaseScreenshot } from "../releaseHighlights";
import "../../styles/show-menu.css";
import "../../styles/updates.css";

const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export function UpdatesScreen() {
  const [screenshot, setScreenshot] = useState<ReleaseScreenshot | null>(null);
  return (
    <div className="show-menu updates-page">
      <div className="show-menu-shell">
        <ProfileHeader activePage="updates" />
        <main className="updates-content">
          <a href="/" className="updates-back">
            <FiArrowLeft aria-hidden="true" /> К играм
          </a>
          <header className="updates-heading">
            <div>
              <span className="updates-eyebrow">PARTYSIDE / ЧТО НОВОГО</span>
              <h1>Обновления</h1>
              <p>Как меняется PartySide: главное о новых возможностях и интерфейсе.</p>
            </div>
            <span className="updates-current">Сейчас v{__APP_VERSION__}</span>
          </header>
          <div className="updates-layout">
            <aside className="updates-navigation">
              <label className="updates-version-picker">
                Перейти к версии
                <select
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) window.location.hash = event.target.value;
                  }}
                >
                  <option value="" disabled>
                    Выберите обновление
                  </option>
                  {releaseHighlights.map((release) => (
                    <option key={release.id} value={release.id}>
                      {release.version} · {release.title}
                    </option>
                  ))}
                </select>
              </label>
              <nav className="updates-versions" aria-label="Версии обновлений">
                <span>Главные обновления</span>
                {releaseHighlights.map((release) => (
                  <a key={release.id} href={`#${release.id}`}>
                    <strong>{release.version}</strong>
                    <small>{release.category}</small>
                  </a>
                ))}
              </nav>
            </aside>
            <div className="updates-releases">
              <p className="updates-archive-note">
                История с первой версии. Собрали заметные изменения, пропустили мелкие правки.
                Сохранившиеся скриншоты показывают интерфейс того времени; восстановленные по
                исходникам отмечены отдельно. Название PartyPlay на архивных скриншотах и в ранних
                записях относится к проекту до переименования в PartySide.
              </p>
              {releaseHighlights.map((release, index) => (
                <article className="updates-release" key={release.id} id={release.id}>
                  <header className="updates-release-meta">
                    <span className="updates-version">v{release.version}</span>
                    <time dateTime={release.date}>{formatDate(release.date)}</time>
                  </header>
                  <span className="updates-eyebrow">{release.category}</span>
                  <h2>{release.title}</h2>
                  <p className="updates-summary">{release.summary}</p>
                  <ul>
                    {release.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                  {release.screenshots.length > 0 && (
                    <div className="updates-gallery">
                      {release.screenshots.map((shot) => (
                        <figure
                          key={shot.src}
                          className={shot.height > shot.width ? "is-portrait" : undefined}
                        >
                          <button
                            type="button"
                            className="updates-screenshot"
                            aria-label={`Увеличить скриншот: ${shot.caption}`}
                            onClick={() => setScreenshot(shot)}
                          >
                            <img
                              src={shot.src}
                              alt={shot.alt}
                              width={shot.width}
                              height={shot.height}
                              loading={index === 0 ? "eager" : "lazy"}
                              decoding="async"
                            />
                            <span>
                              <FiMaximize2 aria-hidden="true" /> Увеличить
                            </span>
                          </button>
                          <figcaption>{shot.caption}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </main>
        <MenuFooter updatesActive />
      </div>
      {screenshot &&
        createPortal(
          <AccessibleModal
            labelledBy="updates-screenshot-title"
            onClose={() => setScreenshot(null)}
            overlayClassName="updates-image-overlay"
            panelClassName="updates-image-dialog"
          >
            <header>
              <h2 id="updates-screenshot-title">{screenshot.caption}</h2>
              <button
                type="button"
                aria-label="Закрыть скриншот"
                onClick={() => setScreenshot(null)}
              >
                <FiX aria-hidden="true" />
              </button>
            </header>
            <img
              src={screenshot.src}
              alt={screenshot.alt}
              width={screenshot.width}
              height={screenshot.height}
            />
          </AccessibleModal>,
          document.body,
        )}
    </div>
  );
}
