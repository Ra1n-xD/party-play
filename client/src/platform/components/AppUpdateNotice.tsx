import { useEffect, useState } from "react";

/** A suspended phone tab may keep an old JS bundle through several deployments. */
export function AppUpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
    if (!entry) return;
    let disposed = false;
    let checking = false;
    let lastCheck = 0;
    const controller = new AbortController();
    const check = async () => {
      if (document.hidden || checking || Date.now() - lastCheck < 30_000) return;
      checking = true;
      lastCheck = Date.now();
      try {
        const response = await fetch("/version.json", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const build: unknown = await response.json();
        if (
          !disposed &&
          build &&
          typeof build === "object" &&
          "entry" in build &&
          typeof build.entry === "string" &&
          build.entry.startsWith("/assets/") &&
          new URL(build.entry, location.origin).href !== entry
        )
          setAvailable(true);
      } catch {
        // Offline tabs and servers predating version.json remain playable.
      } finally {
        checking = false;
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 300_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", check);
    };
  }, []);
  if (!available || dismissed) return null;
  return (
    <aside className="app-update-notice" role="status">
      <span>Доступна новая версия игры</span>
      <button type="button" onClick={() => location.reload()}>
        Обновить
      </button>
      <button type="button" onClick={() => setDismissed(true)}>
        Позже
      </button>
    </aside>
  );
}
