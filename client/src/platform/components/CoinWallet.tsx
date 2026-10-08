import { useEffect, useId, useRef, useState } from "react";
import { FiArrowUpRight, FiBox, FiHeart, FiTarget, FiX } from "react-icons/fi";
import { GAME_REWARD, WIN_REWARD } from "../../../../shared/platform/cosmetics";
import { PET_BOOST_COST, PET_BOOST_GROWTH } from "../../../../shared/platform/pet";
import { CoinAmount } from "./CoinAmount";
import "../../styles/coin-wallet.css";

export function CoinWallet({ coins }: { coins: number }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;
  const panelId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | null>(null);
  const cancelClose = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const close = () => {
    cancelClose();
    setHovered(false);
    setPinned(false);
  };

  useEffect(() => () => cancelClose(), []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (container.current?.contains(document.activeElement)) {
        trigger.current?.focus({ preventScroll: true });
      }
      close();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      className="coin-help"
      ref={container}
      onPointerEnter={(event) => {
        cancelClose();
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        cancelClose();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          setHovered(false);
        }, 200);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <button
        type="button"
        className="coin-wallet"
        ref={trigger}
        aria-label={`Монет на балансе: ${coins}. Как получить и потратить монеты`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        onClick={() => {
          cancelClose();
          setPinned(!pinned);
          setHovered(false);
        }}
      >
        <CoinAmount amount={coins} label="" />
      </button>
      {open && (
        <div className="coin-help-popover">
          <section
            className="coin-help-dialog"
            id={panelId}
            role="dialog"
            aria-labelledby={`${panelId}-title`}
          >
            <header>
              <div>
                <h2 id={`${panelId}-title`}>Монеты PartySide</h2>
                <p>Играйте, собирайте, заботьтесь.</p>
              </div>
              <button
                type="button"
                aria-label="Закрыть окно монет"
                onClick={() => {
                  trigger.current?.focus({ preventScroll: true });
                  close();
                }}
              >
                <FiX aria-hidden="true" />
              </button>
            </header>
            <div className="coin-help-section">
              <h3>Как получить</h3>
              <ul>
                <li>
                  <FiTarget aria-hidden="true" />
                  <span>
                    <strong>Играйте до конца</strong>
                    {GAME_REWARD} монета за партию, {WIN_REWARD} за победу вместо {GAME_REWARD}.
                  </span>
                </li>
                <li>
                  <FiHeart aria-hidden="true" />
                  <span>
                    <strong>Ухаживайте за питомцем</strong>2–5 монет в день — зависит от стадии
                    роста.
                  </span>
                </li>
                <li>
                  <FiArrowUpRight aria-hidden="true" />
                  <span>
                    <strong>Побеждайте в дуэлях</strong>Весь банк из двух ставок достаётся
                    победителю.
                  </span>
                </li>
              </ul>
            </div>
            <div className="coin-help-section">
              <h3>На что потратить</h3>
              <ul>
                <li>
                  <FiBox aria-hidden="true" />
                  <span>
                    <strong>Кейсы с предметами</strong>Персонажи, оформление карт и эмоции.
                  </span>
                </li>
                <li>
                  <FiHeart aria-hidden="true" />
                  <span>
                    <strong>Лакомство для питомца</strong>
                    {PET_BOOST_COST} монет за +{PET_BOOST_GROWTH} роста.
                  </span>
                </li>
                <li>
                  <FiTarget aria-hidden="true" />
                  <span>
                    <strong>Ставка в дуэли</strong>Играйте за монеты или бесплатно со ставкой 0.
                  </span>
                </li>
              </ul>
            </div>
            <p className="coin-help-note">
              В дуэлях награда за обычную партию не начисляется. Улучшения используют предметы, а не
              монеты.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
