import { LuLayers, LuPackageOpen, LuSparkles, LuUserRound, LuArrowRight } from "react-icons/lu";
import { CASES } from "../../../../shared/platform/cases";
import { CaseIcon } from "../components/CaseIcon";
import { CoinAmount } from "../components/CoinAmount";
import { MenuFooter } from "../components/MenuFooter";
import { ProfileHeader } from "../components/ProfileHeader";
import { useProfile } from "../context/ProfileContext";
import { loginHref } from "../authNavigation";
import "../../styles/duels-pet.css";
import "../../styles/guest-account.css";

const pages = {
  "/collection": {
    active: "collection",
    title: "Мои предметы",
    description: "Персонажи, карты и эмоции для вашего вечера за столом.",
    heading: "Соберите свой игровой образ",
    text: "Войдите в аккаунт, чтобы видеть свои предметы, выбирать персонажа, рубашки карт и реакции. Коллекция сохраняется между устройствами.",
    action: "Войти и посмотреть предметы",
    icon: LuLayers,
    benefits: [
      ["Персонажи", "Выберите, кто займёт ваше место за столом."],
      ["Карты", "Оформляйте колоды Дурака и UNO по-своему."],
      ["Эмоции", "Реагируйте на события вместе с друзьями."],
    ],
  },
  "/cases": {
    active: "cases",
    title: "Кейсы",
    description: "Находите персонажей, рубашки карт и эмоции.",
    heading: "Ваша следующая находка — здесь",
    text: "Войдите в аккаунт, чтобы открывать кейсы за монеты. Полученные предметы попадают в вашу коллекцию и доступны в играх.",
    action: "Войти и выбрать кейс",
    icon: LuPackageOpen,
    benefits: [
      ["Выберите кейс", "Общий набор или конкретный тип предметов."],
      ["Узнайте шансы", "Содержимое и вероятности видны до открытия."],
      ["Пополните коллекцию", "Предметы сохраняются в вашем аккаунте."],
    ],
  },
  "/upgrade": {
    active: "upgrade",
    title: "Улучшить",
    description: "Используйте свои предметы, чтобы попробовать получить более ценный.",
    heading: "Дайте предметам новый шанс",
    text: "Войдите в аккаунт, чтобы выбрать предметы из коллекции и желаемую награду. Перед попыткой вы увидите её вероятность; успех не гарантирован.",
    action: "Войти и улучшить предмет",
    icon: LuSparkles,
    benefits: [
      ["Выберите предметы", "Соберите набор из своей коллекции."],
      ["Укажите цель", "Найдите предмет, который хотите получить."],
      ["Оцените шанс", "При неудаче вложенные предметы расходуются."],
    ],
  },
  "/profile": {
    active: "account",
    title: "Профиль игрока",
    eyebrow: "ВАШ АККАУНТ",
    description: "Ваш прогресс, коллекция и настройки в одном месте.",
    heading: "Вернитесь к своему прогрессу",
    text: "Войдите в аккаунт, чтобы увидеть баланс, результаты игр и настройки. Здесь можно изменить никнейм, электронную почту и пароль.",
    action: "Войти в профиль",
    icon: LuUserRound,
    benefits: [
      ["Прогресс", "Монеты, завершённые партии и победы."],
      ["Коллекция", "Ваши персонажи, карты и эмоции."],
      ["Настройки", "Данные аккаунта под вашим контролем."],
    ],
  },
} as const;

export type GuestAccountPath = keyof typeof pages;
export function isGuestAccountPath(path: string): path is GuestAccountPath {
  return Object.hasOwn(pages, path);
}

export function GuestAccountScreen({ path }: { path: GuestAccountPath }) {
  const { loading } = useProfile();
  const page = pages[path];
  const Icon = page.icon;
  return (
    <div className="show-menu feature-page guest-account-page">
      <div className="show-menu-shell">
        <ProfileHeader activePage={page.active} />
        <main className="feature-main guest-account-main">
          <header className="feature-heading">
            {"eyebrow" in page && <span className="feature-eyebrow">{page.eyebrow}</span>}
            <h1>{page.title}</h1>
            <p>{page.description}</p>
          </header>
          <section className="guest-account-intro">
            <div className="guest-account-art" aria-hidden="true">
              <Icon />
            </div>
            <div className="guest-account-copy">
              <h2>{page.heading}</h2>
              <p>{page.text}</p>
              <div className="guest-account-actions">
                <a className="btn btn-primary" href={loginHref(path)}>
                  {page.action} <LuArrowRight aria-hidden="true" />
                </a>
                <a href="/">Играть без аккаунта</a>
              </div>
              <p className="guest-account-note">
                {loading ? "Проверяем вход…" : "Нет аккаунта? Его можно создать на странице входа."}
              </p>
            </div>
          </section>
          {path === "/cases" && (
            <section className="guest-case-preview" aria-label="Доступные кейсы">
              {CASES.map((item) => (
                <article key={item.id}>
                  <CaseIcon caseId={item.id} />
                  <h2>{item.name}</h2>
                  <CoinAmount amount={item.cost} />
                </article>
              ))}
            </section>
          )}
          <section className="guest-account-benefits" aria-label="Возможности раздела">
            {page.benefits.map(([title, description]) => (
              <article key={title}>
                <h2>{title}</h2>
                <p>{description}</p>
              </article>
            ))}
          </section>
        </main>
        <MenuFooter />
      </div>
    </div>
  );
}
