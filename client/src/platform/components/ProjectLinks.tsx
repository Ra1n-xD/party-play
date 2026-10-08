import { BiDonateHeart } from "react-icons/bi";
import { FaTelegramPlane } from "react-icons/fa";
import { FiAlertCircle, FiClock } from "react-icons/fi";

const links = [
  { href: "/updates", label: "Обновления", icon: FiClock },
  { href: "https://t.me/fronted_engineer", label: "Telegram", icon: FaTelegramPlane },
  { href: "https://t.me/Ra1n_xD", label: "Сообщить о проблеме", icon: FiAlertCircle },
  {
    href: "https://www.donationalerts.com/r/fronted_ra1n",
    label: "Поддержать",
    icon: BiDonateHeart,
  },
];

/** Shared markup keeps the footer and mobile menu destinations and icons identical. */
export function ProjectLinks({
  updatesActive = false,
  inMenu = false,
  onNavigate,
}: {
  updatesActive?: boolean;
  inMenu?: boolean;
  onNavigate?: () => void;
}) {
  return links.map(({ href, label, icon: Icon }) => {
    const external = href.startsWith("https:");
    return (
      <a
        key={href}
        href={href}
        className={
          inMenu ? "platform-nav-link" : label === "Поддержать" ? "show-support-link" : undefined
        }
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        aria-current={!external && updatesActive ? "page" : undefined}
        onClick={onNavigate}
      >
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </a>
    );
  });
}
