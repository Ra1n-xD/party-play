import { HOME_TAGLINE, publicGames } from "./siteMetadata";
import "../../styles/public-pages.css";

export function SiteOverview() {
  return (
    <section className="public-overview show-site-overview" aria-labelledby="site-overview-title">
      <h2 id="site-overview-title">О PartySide</h2>
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
    </section>
  );
}
