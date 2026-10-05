// Old tabs can outlive the retained asset generation. Reload once per app version,
// preserving the room/profile tokens; persistent network failures must not cause a loop.
window.addEventListener("vite:preloadError", (event) => {
  if (!navigator.onLine) return;
  try {
    const key = "partyside:asset-reload-version";
    if (sessionStorage.getItem(key) === __APP_VERSION__) return;
    sessionStorage.setItem(key, __APP_VERSION__);
  } catch {
    // Without a persistent guard, leave recovery to the existing error boundary.
    return;
  }
  event.preventDefault();
  window.location.reload();
});
