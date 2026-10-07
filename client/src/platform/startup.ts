import { readReconnectSession } from "./context/reconnectStorage";
import { publicGames } from "./seo/siteMetadata";

/** Runs in the HTML head, before the static menu can paint over a saved room. */
export function prepareStartup() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path !== "/") return;
  const game = new URLSearchParams(window.location.search).get("game");
  if (!readReconnectSession()?.autoRejoin && !publicGames.some((entry) => entry.id === game))
    return;
  document.documentElement.dataset.appStartup = "pending";
  // If the application bundle cannot load, restore the public HTML and its links.
  window.setTimeout(finishStartup, 15_000);
}

export function finishStartup() {
  delete document.documentElement.dataset.appStartup;
}
