import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FiVolume2, FiVolumeX } from "react-icons/fi";
import {
  COSMETIC_KIND_NAMES,
  RARITIES,
  getCosmetic,
  isCosmeticInUse,
  type CaseOpening,
  type Cosmetic,
} from "../../../../shared/platform/cosmetics";
import { CosmeticPreview } from "../components/CosmeticPreview";
import { useProfile } from "../context/ProfileContext";
import { useCollectionAudio } from "../useCollectionAudio";
import { CoinAmount } from "../components/CoinAmount";
import { DropFeed } from "../components/DropFeed";
import { CaseIcon } from "../components/CaseIcon";
import {
  CASES,
  getCase,
  getCaseItems,
  getCaseRarities,
  type CaseId,
} from "../../../../shared/platform/cases";

const WINNER_INDEX = 38;
const CASE_PRESENTATION = {
  partyplay: { color: "#d8fc61" },
  avatar: { color: "#d9b3e8" },
  durak: { color: "#f2be9f" },
  uno: { color: "#bcd780" },
  reaction: { color: "#ffcf67" },
};
function randomItem(items: Cosmetic[]) {
  return items[Math.floor(Math.random() * items.length)];
}
function visibleCardCount(viewport: HTMLDivElement, track: HTMLDivElement) {
  const card = track.firstElementChild as HTMLElement | null;
  if (!card) return 8;
  const gap = Number.parseFloat(getComputedStyle(track).gap) || 0;
  return Math.ceil(viewport.clientWidth / (card.offsetWidth + gap)) + 1;
}
function ReelItem({ item }: { item: Cosmetic }) {
  return (
    <div
      className="case-reel-item"
      style={{ "--rarity-color": RARITIES[item.rarity].color } as CSSProperties}
    >
      <CosmeticPreview item={item} />
      <strong>{item.name}</strong>
      <small>{COSMETIC_KIND_NAMES[item.kind]}</small>
    </div>
  );
}
export function CasesScreen() {
  const sound = useCollectionAudio();
  const { profile, openCase, pendingCaseId, equip, busy, connected } = useProfile();
  const [caseId, setCaseId] = useState<CaseId>(pendingCaseId ?? "partyplay");
  const definition = getCase(caseId)!;
  const caseItems = getCaseItems(caseId);
  const caseRarities = getCaseRarities(caseId);
  const [opening, setOpening] = useState<CaseOpening | null>(null);
  const [reel, setReel] = useState<Cosmetic[]>(() =>
    Array.from({ length: 8 }, () => randomItem(getCaseItems(pendingCaseId ?? "partyplay"))),
  );
  const [phase, setPhase] = useState<"idle" | "request" | "spin" | "result">("idle");
  const [offset, setOffset] = useState(0);
  const [animated, setAnimated] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();
  const frame = useRef<number>();
  const mounted = useRef(true);
  const openingLock = useRef(false);
  const reelSize = useRef({ width: 0, cardWidth: 0 });
  useEffect(() => {
    if (pendingCaseId) setCaseId(pendingCaseId);
  }, [pendingCaseId]);
  const chooseCase = (id: CaseId) => {
    if (openingLock.current || pendingCaseId || busy) return;
    setCaseId(id);
    setOpening(null);
    setPhase("idle");
    setAnimated(false);
    setOffset(0);
    const count =
      viewport.current && track.current ? visibleCardCount(viewport.current, track.current) : 8;
    setReel(Array.from({ length: count }, () => randomItem(getCaseItems(id))));
  };
  useEffect(() => {
    const reelWindow = viewport.current;
    const reelTrack = track.current;
    if (!reelWindow || !reelTrack) return;
    const fitReel = () => {
      const card = reelTrack.firstElementChild as HTMLElement | null;
      if (!card) return;
      const width = reelWindow.clientWidth;
      const cardWidth = card.offsetWidth;
      const resized = width !== reelSize.current.width || cardWidth !== reelSize.current.cardWidth;
      reelSize.current = { width, cardWidth };
      const visibleCount = visibleCardCount(reelWindow, reelTrack);
      // Keep enough cards beyond the winner to fill even a wide reel window.
      const count =
        phase === "spin" || phase === "result" ? WINNER_INDEX + visibleCount + 1 : visibleCount;
      setReel((items) =>
        items.length >= count
          ? items
          : [
              ...items,
              ...Array.from({ length: count - items.length }, () =>
                randomItem(getCaseItems(caseId)),
              ),
            ],
      );
      if (phase === "result" || (phase === "spin" && resized)) {
        const winnerCard = reelTrack.children[WINNER_INDEX] as HTMLElement | undefined;
        if (winnerCard) setOffset(width / 2 - winnerCard.offsetLeft - winnerCard.offsetWidth / 2);
      }
    };
    fitReel();
    const observer = new ResizeObserver(fitReel);
    observer.observe(reelWindow);
    observer.observe(reelTrack.firstElementChild!);
    return () => observer.disconnect();
  }, [caseId, phase, profile?.id]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
      window.cancelAnimationFrame(frame.current ?? 0);
    };
  }, []);
  const finish = () => {
    if (mounted.current && openingLock.current) {
      window.clearTimeout(timer.current);
      window.cancelAnimationFrame(frame.current ?? 0);
      // Cancel the compositor animation too: changing React state alone can leave
      // a running transition visible until the next frame (or a queued RAF).
      const winnerCard = track.current?.children[WINNER_INDEX] as HTMLElement | undefined;
      if (track.current && viewport.current && winnerCard) {
        const finalOffset =
          viewport.current.clientWidth / 2 - winnerCard.offsetLeft - winnerCard.offsetWidth / 2;
        track.current.style.transition = "none";
        track.current.style.transform = `translateX(${finalOffset}px)`;
        track.current.getAnimations().forEach((animation) => animation.cancel());
        setOffset(finalOffset);
      }
      setAnimated(false);
      sound.reveal();
      setPhase("result");
      openingLock.current = false;
    }
  };
  const start = async () => {
    if (openingLock.current || !connected) return;
    sound.unlock();
    openingLock.current = true;
    setPhase("request");
    setOpening(null);
    const result = await openCase(caseId);
    if (!mounted.current) return;
    if (!result) {
      setPhase("idle");
      openingLock.current = false;
      return;
    }
    const winner = getCosmetic(result.itemId)!;
    const resultCaseId = result.caseId ?? "partyplay";
    setCaseId(resultCaseId);
    const visibleCount =
      viewport.current && track.current ? visibleCardCount(viewport.current, track.current) : 8;
    const items = Array.from({ length: WINNER_INDEX + visibleCount + 1 }, () =>
      randomItem(getCaseItems(resultCaseId)),
    );
    items[WINNER_INDEX] = winner;
    setReel(items);
    setOpening(result);
    setAnimated(false);
    setOffset(0);
    setPhase("spin");
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        if (!mounted.current || !openingLock.current) return;
        if (!viewport.current || !track.current) return finish();
        const card = track.current.children[WINNER_INDEX] as HTMLElement;
        setOffset(viewport.current.clientWidth / 2 - card.offsetLeft - card.offsetWidth / 2);
        setAnimated(true);
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        sound.spin(reducedMotion ? 0 : 6);
        timer.current = window.setTimeout(finish, reducedMotion ? 100 : 6200);
      });
    });
  };
  const winner = opening ? getCosmetic(opening.itemId) : null;
  if (!profile) return null;
  const equipped = winner && isCosmeticInUse(profile, winner);
  return (
    <main className="cases-page">
      <DropFeed holdUpdates={phase === "request" || phase === "spin"} />
      <div className="case-selector" role="group" aria-label="Выберите кейс">
        {CASES.map((entry) => {
          const { color } = CASE_PRESENTATION[entry.id];
          return (
            <button
              type="button"
              key={entry.id}
              aria-pressed={caseId === entry.id}
              aria-label={`${entry.name}. ${entry.description}. ${entry.cost} ${entry.cost === 1 ? "монета" : "монет"}`}
              title={entry.description}
              className={`case-choice${caseId === entry.id ? " is-active" : ""}`}
              style={{ "--case-icon-color": color } as CSSProperties}
              disabled={busy || phase === "request" || phase === "spin" || Boolean(pendingCaseId)}
              onClick={() => chooseCase(entry.id)}
            >
              <span className="case-choice-icon" aria-hidden="true">
                <CaseIcon caseId={entry.id} />
              </span>
              <strong>{entry.name}</strong>
              <CoinAmount amount={entry.cost} label="" />
              <span className="case-choice-description">{entry.description}</span>
            </button>
          );
        })}
      </div>
      <h1 className="case-title">{definition.name}</h1>
      <section className={`case-stage phase-${phase}`} aria-label="Открытие кейса">
        <div className="case-stage-light" />
        <div className="case-caption">
          <div>
            <span>
              {phase === "spin"
                ? "Ищем ваш стиль…"
                : phase === "result"
                  ? "Ваша награда"
                  : definition.name}
            </span>
            <small>
              {caseItems.length} предметов · {caseRarities.length} редкостей
            </small>
          </div>
          <button
            type="button"
            className="case-sound-toggle"
            onClick={sound.toggle}
            aria-pressed={sound.enabled}
            aria-label="Звук открытия кейса"
          >
            {sound.enabled ? <FiVolume2 aria-hidden="true" /> : <FiVolumeX aria-hidden="true" />}
            {sound.enabled ? "Звук включён" : "Без звука"}
          </button>
        </div>
        <div className="case-reel-window" ref={viewport} aria-hidden="true">
          <div className="case-pointer" />
          <div
            className={`case-reel-track${animated ? " is-rolling" : ""}`}
            ref={track}
            style={{
              transform: `translateX(${offset}px)`,
              transition: animated && phase === "spin" ? undefined : "none",
            }}
            onTransitionEnd={(event) => {
              if (
                event.target === track.current &&
                event.propertyName === "transform" &&
                phase === "spin"
              )
                finish();
            }}
          >
            {reel.map((item, index) => (
              <ReelItem key={`${index}:${item.id}`} item={item} />
            ))}
          </div>
        </div>
        <div className="case-controls">
          {phase === "spin" ? (
            <button className="profile-text-button" onClick={finish}>
              Пропустить анимацию
            </button>
          ) : (
            <button
              className="profile-primary"
              onClick={start}
              disabled={
                phase === "request" ||
                busy ||
                !connected ||
                (!pendingCaseId && profile.coins < definition.cost)
              }
            >
              {phase === "request" ? (
                "Открываем…"
              ) : pendingCaseId ? (
                "Получить результат"
              ) : profile.coins < definition.cost ? (
                <>
                  {definition.cost === 1 ? "Нужна" : "Нужно"}{" "}
                  <CoinAmount amount={definition.cost} />
                </>
              ) : (
                <>
                  Открыть кейс <CoinAmount amount={definition.cost} />
                </>
              )}
            </button>
          )}
          <span>
            Ваш баланс: <CoinAmount amount={profile.coins} />
          </span>
        </div>
        {phase === "result" && winner && (
          <div
            className="case-result"
            role="status"
            style={{ "--rarity-color": RARITIES[winner.rarity].color } as CSSProperties}
          >
            <span className="cosmetic-rarity">
              {RARITIES[winner.rarity].name} · {COSMETIC_KIND_NAMES[winner.kind]}
            </span>
            <strong>{winner.name}</strong>
            <p>
              {opening?.duplicate
                ? "Повторный предмет добавлен в коллекцию."
                : "Новый предмет уже в вашей коллекции."}
            </p>
            <button
              onClick={() => equip(winner.id)}
              disabled={busy || !connected || !!equipped}
              className="collection-equip"
            >
              {winner.kind === "reaction"
                ? "✓ Доступна в игре"
                : equipped
                  ? "✓ Выбран"
                  : "Использовать"}
            </button>
          </div>
        )}
      </section>
      <div className="case-info">
        <a href="/collection">Открыть коллекцию →</a>
      </div>
      <section className="case-contents">
        <h2>Что внутри</h2>
        <div className="case-chances">
          {caseRarities.map(({ rarity, chance }) => (
            <span key={rarity} style={{ color: RARITIES[rarity].color }}>
              {RARITIES[rarity].name} · {Number(chance.toFixed(2))}%
            </span>
          ))}
        </div>
        <p>Внутри одной редкости все предметы равновероятны. Повторы возможны.</p>
        <div className="collection-grid">
          {caseItems.map((item) => (
            <article
              key={item.id}
              className="collection-item"
              style={{ "--rarity-color": RARITIES[item.rarity].color } as CSSProperties}
            >
              <span className="cosmetic-rarity">{RARITIES[item.rarity].name}</span>
              <CosmeticPreview item={item} />
              <h3>{item.name}</h3>
              <small>{COSMETIC_KIND_NAMES[item.kind]}</small>
            </article>
          ))}
        </div>
      </section>
      {profile.recentOpenings.length > 0 && (
        <section className="case-history">
          <h2>Последние открытия</h2>
          <ul>
            {profile.recentOpenings
              .filter((entry) => phase !== "spin" || entry.requestId !== opening?.requestId)
              .slice(0, 8)
              .map((entry) => {
                const item = getCosmetic(entry.itemId)!;
                return (
                  <li key={entry.requestId}>
                    <span style={{ color: RARITIES[item.rarity].color }}>{item.name}</span>
                    <small>
                      {COSMETIC_KIND_NAMES[item.kind]}
                      {entry.duplicate ? " · повтор" : ""}
                    </small>
                  </li>
                );
              })}
          </ul>
        </section>
      )}
    </main>
  );
}
