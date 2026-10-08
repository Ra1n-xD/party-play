import { usePlatform } from "../context/PlatformContext";
import { ProjectLinks } from "./ProjectLinks";

export function MenuFooter({ updatesActive = false }: { updatesActive?: boolean }) {
  const { connected } = usePlatform();
  return (
    <footer className="show-menu-footer">
      <div className={`show-server-status${connected ? " is-online" : ""}`} role="status">
        <span aria-hidden="true" />
        {connected ? "Готовы к игре" : "Подключаемся к серверу…"}
      </div>
      <nav aria-label="Ссылки проекта">
        <ProjectLinks updatesActive={updatesActive} />
      </nav>
    </footer>
  );
}
