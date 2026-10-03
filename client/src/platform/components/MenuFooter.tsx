import { BiDonateHeart } from "react-icons/bi";
import { FaTelegramPlane, FaTwitch } from "react-icons/fa";
import { FiAlertCircle, FiClock } from "react-icons/fi";
import { usePlatform } from "../context/PlatformContext";

export function MenuFooter({ updatesActive = false }: { updatesActive?: boolean }) {
  const { connected } = usePlatform();
  return (
    <footer className="show-menu-footer">
      <div className={`show-server-status${connected ? " is-online" : ""}`} role="status">
        <span aria-hidden="true" />
        {connected ? "Готовы к игре" : "Подключаемся к серверу…"}
      </div>
      <nav aria-label="Ссылки проекта">
        <a href="/updates" aria-current={updatesActive ? "page" : undefined}>
          <FiClock aria-hidden="true" />
          Обновления
        </a>
        <a href="https://t.me/fronted_engineer" target="_blank" rel="noopener noreferrer">
          <FaTelegramPlane aria-hidden="true" />
          Telegram
        </a>
        <a href="https://www.twitch.tv/fronted_ra1n" target="_blank" rel="noopener noreferrer">
          <FaTwitch aria-hidden="true" />
          Twitch
        </a>
        <a href="https://t.me/Ra1n_xD" target="_blank" rel="noopener noreferrer">
          <FiAlertCircle aria-hidden="true" />
          Сообщить о проблеме
        </a>
        <a
          className="show-support-link"
          href="https://www.donationalerts.com/r/fronted_ra1n"
          target="_blank"
          rel="noopener noreferrer"
        >
          <BiDonateHeart aria-hidden="true" />
          Поддержать
        </a>
      </nav>
    </footer>
  );
}
