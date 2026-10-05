import { brandStorage } from "../brandStorage";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { FiArrowUpRight } from "react-icons/fi";
import type { ProfileSnapshot } from "../../../../shared/platform/cosmetics";
import type { DailyRewardStatus } from "../../../../shared/platform/dailyRewards";
import { usePlatform } from "../context/PlatformContext";
import { useProfile } from "../context/ProfileContext";
import { CoinAmount } from "./CoinAmount";
import { DailyBonusModal } from "./DailyBonusModal";

const HINT_KEY = "partyside_daily_bonus_hint_v1:";
const dismissedInSession = new Set<string>();

function wasDismissed(profileId: string): boolean {
  if (dismissedInSession.has(profileId)) return true;
  try {
    return brandStorage.getItem(`${HINT_KEY}${profileId}`) === "1";
  } catch {
    return false;
  }
}

interface HintPosition {
  left: number;
  top: number;
  arrow: number;
  above: boolean;
  visible: boolean;
}

export function DailyBonusWallet({ profile }: { profile: ProfileSnapshot }) {
  const { connected, getDailyReward } = useProfile();
  const { roomCode } = usePlatform();
  const [dismissed, setDismissed] = useState(() => wasDismissed(profile.id));
  const [bonusOpen, setBonusOpen] = useState(false);
  const [status, setStatus] = useState<DailyRewardStatus | null>(null);
  const [position, setPosition] = useState<HintPosition | null>(null);
  const walletRef = useRef<HTMLButtonElement>(null);
  const hintRef = useRef<HTMLElement>(null);
  const hintId = useId();
  const showHint = !dismissed && !bonusOpen && !roomCode && connected && !!status;
  const dismissHint = useCallback(() => {
    dismissedInSession.add(profile.id);
    setDismissed(true);
    try {
      brandStorage.setItem(`${HINT_KEY}${profile.id}`, "1");
    } catch {
      // Keep the choice for this app session when browser storage is unavailable.
    }
  }, [profile.id]);
  const openBonus = () => {
    dismissHint();
    // Let the modal restore focus to the wallet after the hint unmounts.
    walletRef.current?.focus({ preventScroll: true });
    setBonusOpen(true);
  };

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === `${HINT_KEY}${profile.id}` && event.newValue === "1") {
        dismissedInSession.add(profile.id);
        setDismissed(true);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [profile.id]);

  useEffect(() => {
    if (dismissed || !connected || roomCode) return;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const next = await getDailyReward();
        if (active) setStatus(next);
      } catch {
        // The hint is optional; opening the wallet still exposes connection errors.
      } finally {
        pending = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [dismissed, connected, roomCode, getDailyReward, profile.dailyReward?.date]);

  useLayoutEffect(() => {
    if (!showHint) {
      setPosition(null);
      return;
    }
    const wallet = walletRef.current;
    const hint = hintRef.current;
    if (!wallet || !hint) return;
    const place = () => {
      const anchor = wallet.getBoundingClientRect();
      const bounds = hint.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      const left = Math.max(16, Math.min(anchor.right - bounds.width, width - bounds.width - 16));
      const above = anchor.bottom + bounds.height + 28 > height && anchor.top > bounds.height + 28;
      const top = above ? anchor.top - bounds.height - 14 : anchor.bottom + 14;
      setPosition({
        left,
        top,
        above,
        arrow: Math.max(20, Math.min(anchor.left + anchor.width / 2 - left, bounds.width - 20)),
        visible: anchor.bottom > 0 && anchor.top < height,
      });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[aria-modal="true"]')) return;
      if (hint.contains(document.activeElement)) wallet.focus({ preventScroll: true });
      dismissHint();
    };
    const observer = new ResizeObserver(place);
    observer.observe(wallet);
    observer.observe(hint);
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", escape);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", escape);
    };
  }, [showHint, dismissHint]);

  return (
    <>
      <button
        ref={walletRef}
        type="button"
        className={`coin-wallet${showHint && position?.visible ? " has-bonus-hint" : ""}`}
        aria-label={`Монет на балансе: ${profile.coins}. Ежедневный бонус`}
        aria-describedby={showHint ? `${hintId}-description` : undefined}
        aria-haspopup="dialog"
        onClick={openBonus}
      >
        <CoinAmount amount={profile.coins} label="" />
      </button>
      {showHint &&
        createPortal(
          <aside
            ref={hintRef}
            className={`daily-bonus-hint${position?.above ? " is-above" : ""}`}
            aria-labelledby={`${hintId}-title`}
            style={
              {
                left: position?.left ?? 16,
                top: position?.top ?? 0,
                visibility: position?.visible ? "visible" : "hidden",
                "--hint-arrow": `${position?.arrow ?? 24}px`,
              } as CSSProperties
            }
          >
            <span className="daily-bonus-hint-eyebrow">НОВОЕ В PARTYSIDE</span>
            <h2 id={`${hintId}-title`}>Здесь ваши ежедневные монеты</h2>
            <p id={`${hintId}-description`}>
              Нажмите на монеты, чтобы открыть ежедневный бонус. Забирайте награду каждый день.
            </p>
            <p className="daily-bonus-hint-reward">
              {status?.available ? (
                <>
                  Сегодня доступно <CoinAmount amount={status.available.coins} />
                </>
              ) : (
                "Сегодня бонус уже получен. Следующий — в 00:00 МСК."
              )}
            </p>
            <button type="button" className="daily-bonus-hint-open" onClick={openBonus}>
              Открыть бонус <FiArrowUpRight aria-hidden="true" />
            </button>
            <button
              type="button"
              className="daily-bonus-hint-dismiss"
              onClick={() => {
                dismissHint();
                walletRef.current?.focus({ preventScroll: true });
              }}
            >
              Понятно, позже
            </button>
          </aside>,
          document.body,
        )}
      {bonusOpen &&
        createPortal(<DailyBonusModal onClose={() => setBonusOpen(false)} />, document.body)}
    </>
  );
}
