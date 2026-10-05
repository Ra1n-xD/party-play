import { useCallback, useEffect, useRef, useState } from "react";
import { FiCheck, FiLock, FiX } from "react-icons/fi";
import type { DailyRewardStatus } from "../../../../shared/platform/dailyRewards";
import { GAME_REWARD, WIN_REWARD } from "../../../../shared/platform/cosmetics";
import { useProfile } from "../context/ProfileContext";
import { AccessibleModal } from "./AccessibleModal";
import { CoinAmount } from "./CoinAmount";

export function DailyBonusModal({ onClose }: { onClose(): void }) {
  const { profile, connected, busy, getDailyReward, claimDailyReward } = useProfile();
  const [status, setStatus] = useState<DailyRewardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const claimLock = useRef(false);
  const mounted = useRef(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (notice && status && !status.available && document.activeElement === document.body) {
      closeRef.current?.focus({ preventScroll: true });
    }
  }, [notice, status]);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const next = await getDailyReward();
      if (version !== requestVersion.current) return;
      setStatus(next);
      setError(null);
    } catch (reason) {
      if (version === requestVersion.current) setError((reason as Error).message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [getDailyReward]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const check = () => {
      if (!document.hidden && !claimLock.current) void refresh();
    };
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      mounted.current = false;
      requestVersion.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [refresh, connected, profile?.id, profile?.dailyReward?.date]);

  const claim = async () => {
    if (!status?.available || claimLock.current) return;
    claimLock.current = true;
    requestVersion.current++;
    setClaiming(true);
    setNotice(null);
    setError(null);
    try {
      const reward = await claimDailyReward(status.available.date);
      if (!mounted.current) return;
      setNotice(reward ? `Бонус получен: +${reward.coins} к балансу` : "Сегодня бонус уже получен");
      await refresh();
    } catch (reason) {
      if (mounted.current) setError((reason as Error).message);
    } finally {
      claimLock.current = false;
      if (mounted.current) setClaiming(false);
    }
  };
  const reward = status?.available ?? status?.lastClaim;
  const currentDay = reward?.streak ?? 1;
  const firstDay = Math.floor((currentDay - 1) / 7) * 7 + 1;
  const claimedThrough = status?.available ? currentDay - 1 : status ? currentDay : 0;
  const nextDate = status
    ? new Date(status.nextClaimAt).toLocaleDateString("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "numeric",
        month: "long",
      })
    : null;
  return (
    <AccessibleModal
      labelledBy="daily-bonus-title"
      onClose={onClose}
      panelClassName="daily-bonus-dialog"
    >
      <header className="daily-bonus-heading">
        <div>
          <span>МОНЕТЫ PARTYSIDE</span>
          <h2 id="daily-bonus-title">Ежедневный бонус</h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="daily-bonus-close"
          onClick={onClose}
          aria-label="Закрыть бонус"
        >
          <FiX aria-hidden="true" />
        </button>
      </header>
      {status ? (
        <>
          <div className="daily-bonus-progress">
            <span>{status.available ? `Сегодня — день ${currentDay}` : "Сегодня уже забрали"}</span>
            <span>
              Дни {firstDay}–{firstDay + 6}
            </span>
          </div>
          <ol className="daily-bonus-grid" aria-label="Награды за семь дней серии">
            {Array.from({ length: 7 }, (_, index) => {
              const day = firstDay + index;
              const claimed = day <= claimedThrough;
              const available = !!status.available && day === currentDay;
              const state = claimed ? "Получено" : available ? "Сегодня" : "Позже";
              return (
                <li
                  key={day}
                  className={`daily-bonus-day${claimed ? " is-claimed" : available ? " is-current" : " is-future"}`}
                  aria-current={day === currentDay ? "step" : undefined}
                >
                  <span className="daily-bonus-day-label">День {day}</span>
                  <CoinAmount amount={day} />
                  <span className="daily-bonus-day-state">
                    {claimed ? (
                      <FiCheck aria-hidden="true" />
                    ) : available ? null : (
                      <FiLock aria-hidden="true" />
                    )}
                    {state}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="daily-bonus-next">
            {status.available
              ? "Заберите сегодняшнюю награду."
              : `Следующий бонус — ${nextDate} в 00:00 МСК.`}
          </p>
        </>
      ) : (
        <p className="daily-bonus-next" role="status">
          {loading ? "Проверяем бонус…" : "Не удалось загрузить награды."}
        </p>
      )}
      {notice && (
        <p className="daily-bonus-success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="profile-error" role="alert">
          {error}
        </p>
      )}
      {error ? (
        <button
          type="button"
          className="profile-primary daily-bonus-claim"
          disabled={!connected || claiming}
          onClick={() => void refresh()}
        >
          Проверить ещё раз
        </button>
      ) : status?.available ? (
        <button
          type="button"
          className="profile-primary daily-bonus-claim"
          disabled={!connected || busy || loading || claiming}
          onClick={() => void claim()}
        >
          {claiming ? (
            "Получаем…"
          ) : loading ? (
            "Проверяем…"
          ) : (
            <>
              Забрать{" "}
              <CoinAmount
                amount={status.available.coins}
                label={
                  status.available.coins % 10 === 1 && status.available.coins % 100 !== 11
                    ? "монету"
                    : undefined
                }
              />
            </>
          )}
        </button>
      ) : null}
      <div className="daily-bonus-wallet">
        <span>Ваш баланс</span>
        <CoinAmount amount={profile?.coins ?? 0} />
      </div>
      <p className="daily-bonus-help">
        За победу — {WIN_REWARD} монет, за завершённую партию без победы — {GAME_REWARD} монета.
      </p>
    </AccessibleModal>
  );
}
