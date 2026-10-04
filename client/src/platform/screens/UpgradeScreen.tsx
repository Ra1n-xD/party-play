import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  FiArrowUpRight,
  FiCheck,
  FiPlus,
  FiRefreshCw,
  FiVolume2,
  FiVolumeX,
  FiX,
} from "react-icons/fi";
import {
  CASE_ITEMS,
  COSMETIC_KIND_NAMES,
  RARITIES,
  compareCosmetics,
  getCosmetic,
  isCosmeticInUse,
  type Cosmetic,
  type CosmeticKind,
  type ProfileSnapshot,
} from "../../../../shared/platform/cosmetics";
import {
  MAX_UPGRADE_ITEMS,
  UPGRADE_VALUES,
  getUpgradeAvailableCount,
  getUpgradeInputValue,
  getUpgradeQuote,
  type UpgradeAttempt,
  type UpgradeInput,
} from "../../../../shared/platform/upgrades";
import { CosmeticPreview } from "../components/CosmeticPreview";
import { useProfile } from "../context/ProfileContext";
import { useCollectionAudio } from "../useCollectionAudio";
import { DropFeed } from "../components/DropFeed";
import "../../styles/upgrades.css";

const formatChance = (value: number) =>
  (value / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const formatValue = (value: number) => value.toLocaleString("ru-RU");
type ItemFilter = CosmeticKind | "all";
function TypeFilters({
  value,
  onChange,
  disabled,
  label,
}: {
  value: ItemFilter;
  onChange: (value: ItemFilter) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <nav className="upgrade-filters" aria-label={label}>
      {(["all", "avatar", "durak", "uno", "reaction"] as const).map((kind) => (
        <button
          type="button"
          key={kind}
          aria-pressed={value === kind}
          onClick={() => onChange(kind)}
          disabled={disabled}
        >
          {kind === "all"
            ? "Все"
            : kind === "avatar"
              ? "Персонажи"
              : kind === "durak"
                ? "Дурак"
                : kind === "uno"
                  ? "UNO"
                  : "Эмоции"}
        </button>
      ))}
    </nav>
  );
}

function ItemCard({
  item,
  children,
  className = "",
}: {
  item: Cosmetic;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`upgrade-item ${className}`}
      style={{ "--rarity-color": RARITIES[item.rarity].color } as CSSProperties}
    >
      <span className="cosmetic-rarity">{RARITIES[item.rarity].name}</span>
      <CosmeticPreview item={item} />
      <strong>{item.name}</strong>
      <small>{COSMETIC_KIND_NAMES[item.kind]}</small>
      {children}
    </div>
  );
}

export function UpgradeScreen() {
  const sound = useCollectionAudio();
  const { profile, busy, connected, error, clearError, upgrade, pendingUpgrade, equip } =
    useProfile();
  const [inputs, setInputs] = useState<UpgradeInput[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CosmeticKind | "all">("all");
  const [inputFilter, setInputFilter] = useState<ItemFilter>("all");
  const [multiplier, setMultiplier] = useState(2);
  const [attempt, setAttempt] = useState<UpgradeAttempt | null>(null);
  const [phase, setPhase] = useState<"idle" | "request" | "spin" | "result">("idle");
  const [rotation, setRotation] = useState(0);
  const [previewProfile, setPreviewProfile] = useState<ProfileSnapshot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const frame = useRef<number>();
  const needle = useRef<HTMLDivElement>(null);
  const finalRotation = useRef(0);
  const mounted = useRef(true);
  const locked = useRef(false);
  const revealSuccess = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      cancelAnimationFrame(frame.current ?? 0);
    };
  }, []);

  const available = (item: Cosmetic) => {
    if (!profile) return 0;
    const current = phase === "request" || phase === "spin" ? (previewProfile ?? profile) : profile;
    return getUpgradeAvailableCount(current, item);
  };
  useEffect(() => {
    if (phase !== "idle" || pendingUpgrade || !profile) return;
    setInputs((current) => {
      const next = current
        .map((input) => ({
          ...input,
          count: Math.min(input.count, available(getCosmetic(input.itemId)!)),
        }))
        .filter((input) => input.count > 0);
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [profile, phase, pendingUpgrade]);

  if (!profile) return null;
  const shownInputs = attempt?.inputs ?? pendingUpgrade?.inputs ?? inputs;
  const shownTargetId = attempt?.targetItemId ?? pendingUpgrade?.targetItemId ?? targetId;
  const target = getCosmetic(shownTargetId);
  const selectedCount = shownInputs.reduce((sum, input) => sum + input.count, 0);
  const inputValue = getUpgradeInputValue(shownInputs);
  const quote = target ? getUpgradeQuote(shownInputs, target.id) : null;
  const chance = attempt?.chanceBasisPoints ?? quote?.chanceBasisPoints ?? 0;
  const inactive = phase !== "idle" || !!pendingUpgrade;
  const visibleProfile =
    phase === "request" || phase === "spin" ? (previewProfile ?? profile) : profile;
  const owned = CASE_ITEMS.filter((item) => visibleProfile.inventory[item.id]).sort(
    compareCosmetics,
  );
  const filteredOwned = owned.filter((item) => inputFilter === "all" || item.kind === inputFilter);
  const filtered = CASE_ITEMS.filter((item) => filter === "all" || item.kind === filter);
  const targets = filtered
    .filter(
      (item) =>
        UPGRADE_VALUES[item.rarity] > inputValue &&
        UPGRADE_VALUES[item.rarity] >= inputValue * multiplier,
    )
    .sort(compareCosmetics);
  const equipped = target && isCosmeticInUse(profile, target);

  const add = (item: Cosmetic) => {
    if (inactive || selectedCount >= MAX_UPGRADE_ITEMS) return;
    const count = inputs.find((input) => input.itemId === item.id)?.count ?? 0;
    if (count >= available(item)) return;
    clearError();
    setInputs((current) =>
      count
        ? current.map((input) =>
            input.itemId === item.id ? { ...input, count: count + 1 } : input,
          )
        : [...current, { itemId: item.id, count: 1 }],
    );
  };
  const remove = (itemId: string) => {
    if (inactive) return;
    setInputs((current) =>
      current
        .map((input) => (input.itemId === itemId ? { ...input, count: input.count - 1 } : input))
        .filter((input) => input.count > 0),
    );
  };
  const finish = () => {
    clearTimeout(timer.current);
    cancelAnimationFrame(frame.current ?? 0);
    if (mounted.current && locked.current) {
      if (needle.current) {
        needle.current.style.transition = "none";
        needle.current.style.transform = `rotate(${finalRotation.current}deg)`;
        needle.current.getAnimations().forEach((animation) => animation.cancel());
      }
      setRotation(finalRotation.current);
      sound.reveal(revealSuccess.current);
      setPhase("result");
    }
    locked.current = false;
  };
  const start = async () => {
    if (locked.current || busy || !connected || (!quote && !pendingUpgrade)) return;
    sound.unlock();
    locked.current = true;
    setPreviewProfile(profile);
    setPhase("request");
    setAttempt(null);
    setRotation(0);
    const result = await upgrade(inputs, targetId ?? "");
    if (!mounted.current) return;
    if (!result) {
      locked.current = false;
      setPhase("idle");
      return;
    }
    setAttempt(result);
    revealSuccess.current = result.success;
    setPhase("spin");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    finalRotation.current = (reduced ? 0 : 1800) + (result.roll / 10_000) * 360;
    frame.current = requestAnimationFrame(() => {
      if (!mounted.current || !locked.current) return;
      setRotation(finalRotation.current);
      sound.spin(reduced ? 0 : 4.1);
      timer.current = setTimeout(finish, reduced ? 100 : 4300);
    });
  };
  const reset = () => {
    clearError();
    setPhase("idle");
    setAttempt(null);
    setInputs([]);
    setTargetId(null);
    setRotation(0);
  };

  return (
    <main className="upgrade-page">
      <DropFeed holdUpdates={phase === "request" || phase === "spin"} />
      {pendingUpgrade && phase === "idle" && (
        <div className="upgrade-pending" role="status">
          Результат предыдущей попытки ещё не получен. Восстановите его без повторного списания.
        </div>
      )}
      <section
        className={`upgrade-stage phase-${phase}${phase === "result" ? (attempt?.success ? " is-success" : " is-failure") : ""}`}
        aria-label="Улучшение предметов"
      >
        <div className="upgrade-selection">
          <div className="upgrade-section-label">
            <span>01</span> Ваши предметы
          </div>
          {shownInputs.length ? (
            <div className="upgrade-selected-items">
              {shownInputs.map((input) => {
                const item = getCosmetic(input.itemId)!;
                return (
                  <div className="upgrade-selected-item" key={item.id}>
                    <CosmeticPreview item={item} />
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {COSMETIC_KIND_NAMES[item.kind]} · ×{input.count}
                      </small>
                    </div>
                    <button
                      type="button"
                      disabled={inactive}
                      onClick={() => remove(item.id)}
                      aria-label={`Убрать ${item.name}`}
                    >
                      <FiX aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="upgrade-placeholder">
              <FiPlus aria-hidden="true" />
              <strong>С чего начнём?</strong>
              <p>Выберите до {MAX_UPGRADE_ITEMS} предметов из инвентаря ниже.</p>
            </div>
          )}
          <div className="upgrade-value">
            <span>Общая ценность</span>
            <strong>
              {formatValue(inputValue)} <small>ед.</small>
            </strong>
          </div>
        </div>

        <div className="upgrade-center">
          <div
            className="upgrade-wheel"
            style={{ "--upgrade-chance": chance / 100 } as CSSProperties}
          >
            <div className="upgrade-wheel-ticks" />
            <div
              className="upgrade-needle"
              ref={needle}
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: phase === "spin" ? undefined : "none",
              }}
            />
            <div className="upgrade-wheel-core">
              <span>
                {phase === "result"
                  ? attempt?.success
                    ? "УСПЕХ"
                    : "НЕ В ЭТОТ РАЗ"
                  : "ШАНС УЛУЧШЕНИЯ"}
              </span>
              <strong>
                {phase === "result" ? (
                  attempt?.success ? (
                    <FiCheck aria-label="Успех" />
                  ) : (
                    <FiX aria-label="Неудача" />
                  )
                ) : (
                  <>
                    {formatChance(chance)}
                    <small>%</small>
                  </>
                )}
              </strong>
              <small>
                {target && inputValue
                  ? `×${(UPGRADE_VALUES[target.rarity] / inputValue).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} к ценности`
                  : "Выберите предметы и цель"}
              </small>
            </div>
          </div>
          {phase === "spin" ? (
            <button type="button" className="profile-text-button" onClick={finish}>
              Показать результат
            </button>
          ) : phase === "result" ? (
            <button type="button" className="profile-primary" onClick={reset}>
              <FiRefreshCw aria-hidden="true" /> Ещё попытка
            </button>
          ) : (
            <button
              type="button"
              className="profile-primary upgrade-start"
              onClick={start}
              disabled={busy || !connected || (!quote && !pendingUpgrade)}
            >
              {phase === "request"
                ? "Получаем результат…"
                : pendingUpgrade
                  ? "Восстановить результат"
                  : "Улучшить"}
              <FiArrowUpRight aria-hidden="true" />
            </button>
          )}
          <p className="upgrade-outcome" role="status" aria-live="polite">
            {phase === "result"
              ? attempt?.success
                ? "Цель уже добавлена в вашу коллекцию."
                : "Выбранные предметы потрачены. Можно попробовать снова."
              : phase === "spin"
                ? "Проверяем удачу…"
                : target && inputValue && !quote
                  ? "Цель должна быть ценнее выбранных предметов."
                  : "При неудаче выбранные предметы будут потрачены."}
          </p>
          <button
            type="button"
            className="case-sound-toggle"
            onClick={sound.toggle}
            aria-pressed={sound.enabled}
            aria-label="Звук улучшения"
          >
            {sound.enabled ? <FiVolume2 aria-hidden="true" /> : <FiVolumeX aria-hidden="true" />}
            {sound.enabled ? "Звук включён" : "Без звука"}
          </button>
        </div>

        <div className="upgrade-selection upgrade-target">
          <div className="upgrade-section-label">
            <span>02</span> Ваша цель
          </div>
          {target ? (
            <ItemCard item={target} />
          ) : (
            <div className="upgrade-placeholder">
              <FiArrowUpRight aria-hidden="true" />
              <strong>На уровень выше</strong>
              <p>Выберите более ценный предмет из каталога.</p>
            </div>
          )}
          <div className="upgrade-value">
            <span>Ценность цели</span>
            <strong>
              {target ? formatValue(UPGRADE_VALUES[target.rarity]) : "—"} <small>ед.</small>
            </strong>
          </div>
          {phase === "result" && attempt?.success && target && (
            <button
              type="button"
              className="collection-equip"
              onClick={() => equip(target.id)}
              disabled={busy || !connected || !!equipped}
            >
              {target.kind === "reaction"
                ? "✓ Доступна в игре"
                : equipped
                  ? "✓ Используется"
                  : "Использовать предмет"}
            </button>
          )}
        </div>
      </section>
      {error && (
        <p className="profile-error" role="alert">
          {error}
        </p>
      )}

      <div className="upgrade-catalogs">
        <section aria-labelledby="upgrade-inventory-title">
          <div className="upgrade-catalog-heading">
            <div>
              <span className="profile-eyebrow">ОТДАЁТЕ</span>
              <h2 id="upgrade-inventory-title">Ваши предметы</h2>
            </div>
            <span>
              {selectedCount} / {MAX_UPGRADE_ITEMS}
            </span>
          </div>
          <p className="upgrade-catalog-note">
            Базовые предметы не участвуют в улучшении. Используемые скины и последняя копия каждой
            эмоции защищены.
          </p>
          <TypeFilters
            value={inputFilter}
            onChange={setInputFilter}
            disabled={inactive}
            label="Тип ваших предметов"
          />
          {filteredOwned.length ? (
            <div className="upgrade-grid">
              {filteredOwned.map((item) => {
                const selected = shownInputs.find((input) => input.itemId === item.id)?.count ?? 0;
                const count = available(item);
                return (
                  <button
                    type="button"
                    className={`upgrade-catalog-item${selected ? " is-selected" : ""}`}
                    key={item.id}
                    onClick={() => add(item)}
                    disabled={inactive || selectedCount >= MAX_UPGRADE_ITEMS || selected >= count}
                    aria-label={`Добавить ${item.name}, ${COSMETIC_KIND_NAMES[item.kind]}`}
                  >
                    <ItemCard item={item}>
                      <div className="upgrade-item-meta">
                        <span>
                          {count
                            ? `Доступно: ${count}`
                            : item.kind === "reaction"
                              ? "Последняя копия защищена"
                              : "Используется"}
                        </span>
                        <strong>
                          {selected
                            ? `Выбрано: ${selected}`
                            : `${formatValue(UPGRADE_VALUES[item.rarity])} ед.`}
                        </strong>
                      </div>
                    </ItemCard>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="upgrade-empty">
              <FiPlus aria-hidden="true" />
              <h3>{owned.length ? "Нет предметов этого типа" : "Пока нечего улучшать"}</h3>
              {owned.length ? (
                <button
                  type="button"
                  className="profile-primary"
                  onClick={() => setInputFilter("all")}
                  disabled={inactive}
                >
                  Показать все предметы
                </button>
              ) : (
                <>
                  <p>Откройте кейс, чтобы пополнить коллекцию.</p>
                  <a href="/cases" className="profile-primary">
                    К кейсам <FiArrowUpRight aria-hidden="true" />
                  </a>
                </>
              )}
            </div>
          )}
        </section>
        <section aria-labelledby="upgrade-targets-title">
          <div className="upgrade-catalog-heading">
            <div>
              <span className="profile-eyebrow">ПОЛУЧАЕТЕ</span>
              <h2 id="upgrade-targets-title">Выберите цель</h2>
            </div>
            <span>{targets.length} предметов</span>
          </div>
          <TypeFilters value={filter} onChange={setFilter} disabled={inactive} label="Тип цели" />
          <div className="upgrade-multipliers" aria-label="Минимальная ценность цели">
            <span>От</span>
            {[1, 2, 3, 5, 10].map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={multiplier === value}
                onClick={() => setMultiplier(value)}
                disabled={inactive}
              >
                ×{value}
              </button>
            ))}
          </div>
          {targets.length ? (
            <div className="upgrade-grid">
              {targets.map((item) => (
                <button
                  type="button"
                  className={`upgrade-catalog-item${target?.id === item.id ? " is-selected" : ""}`}
                  key={item.id}
                  onClick={() => {
                    clearError();
                    setTargetId(item.id);
                  }}
                  disabled={inactive}
                  aria-pressed={target?.id === item.id}
                  aria-label={`Цель ${item.name}, ${COSMETIC_KIND_NAMES[item.kind]}`}
                >
                  <ItemCard item={item}>
                    <div className="upgrade-item-meta">
                      <span>{formatValue(UPGRADE_VALUES[item.rarity])} ед.</span>
                      <strong>
                        {inputValue
                          ? `${formatChance(getUpgradeQuote(shownInputs, item.id)?.chanceBasisPoints ?? 0)}%`
                          : "Выбрать"}
                      </strong>
                    </div>
                  </ItemCard>
                </button>
              ))}
            </div>
          ) : (
            <div className="upgrade-empty">
              <p>
                Для этого множителя нет целей. Уменьшите множитель или число выбранных предметов.
              </p>
            </div>
          )}
        </section>
      </div>
      {!!profile.recentUpgrades?.length && (
        <section className="upgrade-history" aria-labelledby="upgrade-history-title">
          <h2 id="upgrade-history-title">Последние попытки</h2>
          <ul>
            {profile.recentUpgrades
              .filter(
                (entry) =>
                  (phase !== "spin" && phase !== "request") ||
                  entry.requestId !== (attempt?.requestId ?? pendingUpgrade?.requestId),
              )
              .slice(0, 6)
              .map((entry) => (
                <li key={entry.requestId}>
                  <span className={`upgrade-history-icon${entry.success ? " is-success" : ""}`}>
                    {entry.success ? <FiCheck aria-hidden="true" /> : <FiX aria-hidden="true" />}
                  </span>
                  <div>
                    <strong>{getCosmetic(entry.targetItemId)?.name}</strong>
                    <small>
                      {COSMETIC_KIND_NAMES[getCosmetic(entry.targetItemId)!.kind]} · шанс{" "}
                      {formatChance(entry.chanceBasisPoints)}%
                    </small>
                  </div>
                  <span>{entry.success ? "Успех" : "Неудача"}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
