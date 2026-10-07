import { FiArrowRight } from "react-icons/fi";
import { BrandDice } from "../components/BrandDice";
import "../../styles/show-menu.css";
import "../../styles/not-found.css";

export function NotFoundScreen() {
  return (
    <div className="show-menu not-found-page">
      <div className="show-menu-shell not-found-shell">
        <header className="show-menu-header not-found-header">
          <a className="show-brand" href="/" aria-label="PartySide — на главную">
            <BrandDice className="show-brand-dice" />
            <span className="show-brand-name">partyside</span>
          </a>
        </header>
        <main className="not-found-content">
          <p className="not-found-eyebrow">ОШИБКА 404</p>
          <div className="not-found-code" aria-hidden="true">
            <span>4</span>
            <BrandDice />
            <span>4</span>
          </div>
          <h1>Такой страницы нет</h1>
          <p>Возможно, ссылка устарела или адрес указан с ошибкой.</p>
          <div className="not-found-actions">
            <a className="not-found-home" href="/">
              К играм <FiArrowRight aria-hidden="true" />
            </a>
            <a href="/updates">Обновления</a>
          </div>
        </main>
      </div>
    </div>
  );
}
