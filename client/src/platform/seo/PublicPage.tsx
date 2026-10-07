import { bunkerRules } from "../../games/bunker/rules";
import { durakRules } from "../../games/durak/rules";
import { unoRules } from "../../games/uno/rules";
import { BrandDice } from "../components/BrandDice";
import { publicGames } from "./siteMetadata";
import "../../styles/public-pages.css";

const rulesByGame = { bunker: bunkerRules, durak: durakRules, uno: unoRules };

/** Also rendered at build time: identical public copy for people and crawlers. */
export function PublicPage({ path }: { path: string }) {
  const game = publicGames.find((entry) => `/games/${entry.id}` === path);
  if (!game) throw new Error(`Unknown public game page: ${path}`);
  const rules = rulesByGame[game.id];
  return (
    <div className="show-menu public-page">
      <div className="public-page-shell">
        <header className="public-page-header">
          <a className="show-brand" href="/" aria-label="PartySide — на главную">
            <BrandDice className="show-brand-dice" />
            <span className="show-brand-name">partyside</span>
          </a>
          <nav aria-label="Навигация PartySide">
            <a href="/">Игры</a>
            <a href="/updates">Обновления</a>
            <a href="/login">Войти</a>
          </nav>
        </header>
        <main>
          <p className="public-eyebrow">PARTYSIDE / ИГРЫ ДЛЯ СВОЕЙ КОМПАНИИ</p>
          <h1>{game.name} онлайн с друзьями</h1>
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
        </main>
        <footer className="public-page-footer">
          <a href="/">К каталогу игр</a>
          <a href="/updates">История обновлений</a>
        </footer>
      </div>
    </div>
  );
}
