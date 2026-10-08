import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { FiChevronDown, FiGrid, FiHeart } from "react-icons/fi";
import {
  PET_BOOST_COST,
  PET_BOOST_GROWTH,
  PET_STAGES,
  PET_SPECIES,
  PET_SPECIES_INFO,
  petStatus,
  type PetAction,
} from "../../../../shared/platform/pet";
import { getMoscowDay } from "../../../../shared/platform/dailyRewards";
import { socket } from "../../socket";
import { useProfile } from "../context/ProfileContext";
import { ProfileHeader } from "../components/ProfileHeader";
import { MenuFooter } from "../components/MenuFooter";
import { CoinAmount, coinLabel } from "../components/CoinAmount";
import "../../styles/duels-pet.css";
import { loginHref } from "../authNavigation";
const PetPreview = lazy(() => import("../components/PetPreview"));
export function PetScreen() {
  const { profile, connected } = useProfile();
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const pet = profile?.pet;
  const status = pet && now ? petStatus(pet, now) : null;
  const species = pet?.species ?? "dragon";
  const action = (value: PetAction) => {
    if (pending.current || !connected) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    socket
      .timeout(10000)
      .emit(
        "pet:action",
        { action: value, petId: pet?.id ?? null, day: getMoscowDay(now) },
        (timeout, result) => {
          pending.current = false;
          setBusy(false);
          if (timeout)
            setError(
              "Ответ задержался. Данные обновятся после подключения; повторный уход не начислит награду дважды.",
            );
          else if (!result.ok) setError(result.error);
          else
            setMessage(
              value === "adopt"
                ? "У вас появился новый друг. Первый уход — завтра!"
                : value === "care"
                  ? "Питомец накормлен, ухожен и доволен. Монеты уже на балансе."
                  : "Лакомство помогло подрасти!",
            );
        },
      );
  };
  return (
    <div className="show-menu feature-page">
      <div className="show-menu-shell">
        <ProfileHeader activePage="pet" />
        <main className="feature-main pet-main">
          <header className="feature-heading">
            <h1>Питомец</h1>
            <p>Ваш напарник за игровым столом.</p>
          </header>
          <section className="pet-home feature-panel">
            <div className={`pet-stage-art${status && !status.alive ? " is-lost" : ""}`}>
              <div className="pet-orbit" />
              {now ? (
                <Suspense fallback={<div className="pet-preview pet-fallback">🥚</div>}>
                  <PetPreview
                    stage={status?.stage ?? 0}
                    species={species}
                    interactive={!status || status.alive}
                  />
                </Suspense>
              ) : (
                <div className="pet-preview pet-fallback" aria-label="Яйцо питомца">
                  🥚
                </div>
              )}
              <span className="pet-stage-name">
                {status
                  ? status.alive
                    ? `${PET_SPECIES_INFO[species].name} · ${PET_STAGES[status.stage]}`
                    : "Питомец погиб"
                  : "Всё начинается с яйца"}
              </span>
            </div>
            <div className="pet-care-panel">
              <h2>
                {!pet
                  ? "Познакомьтесь с вашим питомцем"
                  : status?.alive
                    ? "Немного заботы — каждый день"
                    : "Можно начать новую историю"}
              </h2>
              {!pet ? (
                <p>
                  Из яйца появится один из пяти питомцев — шанс каждого 20%. Уход приносит монеты. В
                  3D-играх он будет сидеть рядом с вами.
                </p>
              ) : !status?.alive ? (
                <p>
                  Без ухода прошло 7 суток, и питомец погиб. Монеты и коллекция сохранены. Можно
                  бесплатно взять новое яйцо и вырастить нового друга.
                </p>
              ) : (
                <>
                  <div className="pet-growth">
                    <span>
                      Рост <strong>{pet.growth} / 30</strong>
                    </span>
                    <progress value={pet.growth} max={30} aria-label="Рост питомца" />
                  </div>
                  <div className="pet-care-reward">
                    <span>{status.canCare ? "За сегодняшний уход" : "За следующий уход"}</span>
                    <CoinAmount amount={status.reward} />
                  </div>
                  <p className="feature-note">
                    {status.canCare
                      ? "Покормите малыша и поиграйте с ним."
                      : "Следующий уход — завтра, после 00:00 МСК."}
                  </p>
                  <p
                    className={`pet-neglect${status.expiresAt - now < 2 * 86400000 ? " is-urgent" : ""}`}
                  >
                    До гибели без ухода:{" "}
                    {Math.min(168, Math.max(1, Math.ceil((status.expiresAt - now) / 3600000)))} ч.
                  </p>
                </>
              )}
              {!profile ? (
                <a href={loginHref("/pet")} className="btn btn-primary">
                  Войти и взять питомца
                </a>
              ) : !pet || (status && !status.alive) ? (
                <button
                  className="btn btn-primary"
                  disabled={busy || !connected || !now}
                  onClick={() => action("adopt")}
                >
                  Взять яйцо бесплатно
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-primary"
                    disabled={busy || !connected || !status?.canCare}
                    onClick={() => action("care")}
                  >
                    {busy
                      ? "Сохраняем…"
                      : status?.canCare
                        ? "Покормить и поиграть"
                        : "Сегодня питомец ухожен"}
                  </button>
                  {status?.stage !== 3 && (
                    <>
                      <button
                        className="btn btn-secondary"
                        disabled={
                          busy || !connected || !status?.canBoost || profile.coins < PET_BOOST_COST
                        }
                        onClick={() => action("boost")}
                      >
                        Лакомство · +{PET_BOOST_GROWTH} роста за {PET_BOOST_COST} монет
                      </button>
                      <small>Раз в сутки. Лакомство ускоряет рост, но не заменяет уход.</small>
                    </>
                  )}
                </>
              )}
              {message && (
                <p role="status" className="pet-success">
                  {message}
                </p>
              )}
              {error && (
                <p role="alert" className="feature-error">
                  {error}
                </p>
              )}
              {profile && !connected && (
                <p role="status">Нет связи с сервером. Дождитесь подключения.</p>
              )}
            </div>
            <aside className="pet-milestones" aria-label="Стадии роста">
              {PET_STAGES.map((name, i) => (
                <article
                  key={name}
                  className={status?.alive && status.stage === i ? "is-current" : ""}
                >
                  <span>0{i + 1}</span>
                  <h3>{name}</h3>
                  <p>{["0–2", "3–9", "10–29", "30"][i]} роста</p>
                  <small>
                    {i + 2} {coinLabel(i + 2)} за уход
                  </small>
                </article>
              ))}
            </aside>
          </section>
          <div className="pet-extra">
            <details className="feature-panel">
              <summary>
                <span className="pet-guide-icon" aria-hidden="true">
                  <FiHeart />
                </span>
                <span className="pet-guide-title">
                  <strong>Как живёт питомец</strong>
                  <small>Уход, рост и награды</small>
                </span>
                <FiChevronDown className="pet-guide-chevron" aria-hidden="true" />
              </summary>
              <div className="pet-guide-content">
                <p>
                  Питомец заменяет ежедневный бонус. Забрать монеты можно за один уход в календарный
                  день по Москве. Уход даёт +1 роста и от 2 до 5 монет в зависимости от стадии до
                  ухода. В день получения яйца награды нет; первый уход доступен со следующего дня.
                </p>
                <p>
                  Если не ухаживать ровно 7 суток, питомец погибает. Вход на сайт и покупка
                  лакомства не сбрасывают этот срок — нужен уход. После гибели доступно бесплатное
                  новое яйцо с нулевым ростом.
                </p>
                <p>
                  Лакомство стоит 10 монет и даёт +3 роста, не чаще одного раза в сутки. Рост
                  ограничен 30. В 3D-комнатах Бункера, Дурака и UNO питомец находится рядом с вашим
                  местом.
                </p>
              </div>
            </details>
            <details className="feature-panel pet-species">
              <summary>
                <span className="pet-guide-icon" aria-hidden="true">
                  <FiGrid />
                </span>
                <span className="pet-guide-title">
                  <strong>Кто может появиться</strong>
                  <small>5 видов · равные шансы</small>
                </span>
                <FiChevronDown className="pet-guide-chevron" aria-hidden="true" />
              </summary>
              <div className="pet-guide-content">
                <p>
                  Каждое новое яйцо получает случайный вид. Шанс каждого — 20%, уход и награды
                  одинаковые.
                </p>
                <ul>
                  {PET_SPECIES.map((id) => (
                    <li key={id}>
                      <span aria-hidden="true">{PET_SPECIES_INFO[id].emoji}</span>{" "}
                      {PET_SPECIES_INFO[id].name}
                      <b>20%</b>
                    </li>
                  ))}
                </ul>
                <p>
                  Вид сохраняется на всех стадиях. Нажмите на питомца здесь или за 3D-столом: каждый
                  отвечает по-своему. Игра с питомцем не заменяет ежедневный уход.
                </p>
              </div>
            </details>
          </div>
        </main>
        <MenuFooter />
      </div>
    </div>
  );
}
