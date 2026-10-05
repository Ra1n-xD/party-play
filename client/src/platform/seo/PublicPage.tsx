import { bunkerRules } from "../../games/bunker/rules";
import { durakRules } from "../../games/durak/rules";
import { unoRules } from "../../games/uno/rules";
import { BrandDice } from "../components/BrandDice";
import { releaseHighlights } from "../releaseHighlights";
import { HOME_TAGLINE, publicGames } from "./siteMetadata";
import "../../styles/public-pages.css";

const rulesByGame = { bunker: bunkerRules, durak: durakRules, uno: unoRules };

export function SiteOverview() {
  return (
    <div className="public-overview">
      <p>
        {HOME_TAGLINE} Выбирайте игру в каталоге, создавайте комнату и отправляйте друзьям её код.
        Присоединиться можно с компьютера или телефона.
      </p>
      <div className="public-game-links">
        {publicGames.map((game) => (
          <a key={game.id} href={`/games/${game.id}`}>
            <strong>{game.name} онлайн</strong>
            <span>{game.players} · правила и описание</span>
          </a>
        ))}
      </div>
      <h2>Как играть с друзьями</h2>
      <ol>
        <li>Выберите игру в каталоге и создайте комнату с никнеймом.</li>
        <li>Поделитесь кодом: друзья введут его на главной странице.</li>
        <li>Хост запускает партию. Если участников не хватает, добавьте ботов в лобби.</li>
      </ol>
      <h2>Своя компания или открытая комната</h2>
      <p>
        Закрытая комната доступна по коду. Открытые комнаты можно найти в каталоге: зайдите на
        свободное место или присоединитесь зрителем.
      </p>
      <h2>Нужна ли регистрация?</h2>
      <p>
        Гость может играть по никнейму. Аккаунт нужен, чтобы сохранять монеты, коллекцию персонажей,
        карт и эмоций, получать ежедневные бонусы и участвовать в рейтинге.
      </p>
    </div>
  );
}

/** Also rendered at build time: identical public copy for people and crawlers. */
export function PublicPage({ path }: { path: string }) {
  const game = publicGames.find((entry) => `/games/${entry.id}` === path);
  const rules = game ? rulesByGame[game.id] : null;
  const updates = path === "/updates";
  return (
    <div className="show-menu public-page">
      <div className="public-page-shell">
        <header className="public-page-header">
          <a className="show-brand" href="/" aria-label="PartySide — на главную">
            <BrandDice className="show-brand-dice" />
            partyside
          </a>
          <nav aria-label="Навигация PartySide">
            <a href="/">Игры</a>
            <a href="/updates">Обновления</a>
            <a href="/login">Войти</a>
          </nav>
        </header>
        <main>
          <p className="public-eyebrow">PARTYSIDE / ИГРЫ ДЛЯ СВОЕЙ КОМПАНИИ</p>
          <h1>
            {game
              ? `${game.name} онлайн с друзьями`
              : updates
                ? "Обновления PartySide"
                : "Игры онлайн для своей компании"}
          </h1>
          {game && rules ? (
            <>
              <p className="public-intro">{rules.summary}</p>
              <p>{game.players} · боты · зрители · 2D и 3D · компьютер и телефон</p>
              <a className="public-play" href={`/?game=${game.id}`}>
                Играть в {game.name}
              </a>
              <h2>Как начать</h2>
              <p>
                Создайте комнату, укажите никнейм и поделитесь кодом с друзьями. Добавьте ботов при
                необходимости и запустите партию из лобби. Можно играть гостем, без регистрации.
              </p>
              <h2>Правила игры {game.name}</h2>
              {rules.sections.map((section) => (
                <section key={section.title} className="public-rule-section">
                  <h3>{section.title}</h3>
                  {section.description && <p>{section.description}</p>}
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
              <h2>Советы для первой партии</h2>
              <ul>
                {rules.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
              <a className="public-play" href={`/?game=${game.id}`}>
                Создать комнату
              </a>
              <h2>Другие игры для компании</h2>
              <nav className="public-game-links" aria-label="Другие игры">
                {publicGames
                  .filter((entry) => entry.id !== game.id)
                  .map((entry) => (
                    <a key={entry.id} href={`/games/${entry.id}`}>
                      {entry.name} онлайн
                    </a>
                  ))}
              </nav>
            </>
          ) : updates ? (
            <>
              <p className="public-intro">
                Как меняется PartySide: главное о новых возможностях и интерфейсе.
              </p>
              <p>Архивные скриншоты и названия отражают интерфейс до переименования в PartySide.</p>
              <nav className="public-game-links" aria-label="Версии обновлений">
                {releaseHighlights.map((release) => (
                  <a key={release.id} href={`#${release.id}`}>
                    v{release.version}
                  </a>
                ))}
              </nav>
              {releaseHighlights.map((release) => (
                <article key={release.id} id={release.id} className="public-rule-section">
                  <p>
                    v{release.version} · <time dateTime={release.date}>{release.date}</time>
                  </p>
                  <h2>{release.title}</h2>
                  <p>{release.summary}</p>
                  <ul>
                    {release.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </>
          ) : (
            <SiteOverview />
          )}
        </main>
        <footer className="public-page-footer">
          <a href="/">К каталогу игр</a>
          <a href="/updates">История обновлений</a>
        </footer>
      </div>
    </div>
  );
}
