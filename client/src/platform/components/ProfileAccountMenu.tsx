import { useEffect, useId, useRef, useState } from "react";
import { FiChevronDown, FiLogOut, FiUser } from "react-icons/fi";

interface ProfileAccountMenuProps {
  nickname: string;
  active: boolean;
  disabled: boolean;
  inRoom: boolean;
  onLogout: () => void;
}

export function ProfileAccountMenu({
  nickname,
  active,
  disabled,
  inRoom,
  onLogout,
}: ProfileAccountMenuProps) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const profileLinkRef = useRef<HTMLAnchorElement>(null);
  const close = () => {
    setHovered(false);
    setPinned(false);
  };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setHovered(false);
        setPinned(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (containerRef.current?.contains(document.activeElement)) {
        triggerRef.current?.focus({ preventScroll: true });
      }
      setHovered(false);
      setPinned(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  return (
    <div
      className="show-account-menu"
      ref={containerRef}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <button
        className="show-account-trigger"
        ref={triggerRef}
        type="button"
        aria-label={`Меню аккаунта: ${nickname}`}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-active={active || undefined}
        onClick={() => {
          setPinned(!pinned);
          setHovered(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setPinned(true);
          setHovered(false);
          requestAnimationFrame(() => profileLinkRef.current?.focus());
        }}
      >
        <span className="show-profile-nickname">{nickname}</span>
        <FiChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="show-account-popover" id={menuId}>
          <div className="show-account-dropdown">
            <p className="show-account-name">{nickname}</p>
            <a
              ref={profileLinkRef}
              href="/profile"
              aria-current={active ? "page" : undefined}
              onClick={close}
            >
              <FiUser aria-hidden="true" /> Профиль
            </a>
            <button
              type="button"
              className="show-account-logout"
              disabled={disabled}
              title={inRoom ? "Выйти из аккаунта и покинуть комнату" : undefined}
              onClick={() => {
                triggerRef.current?.focus({ preventScroll: true });
                close();
                onLogout();
              }}
            >
              <FiLogOut aria-hidden="true" /> Выйти
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
