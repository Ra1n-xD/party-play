const returnPages = new Set([
  "/collection",
  "/profile",
  "/cases",
  "/upgrade",
  "/pet",
  "/duels",
  "/leaderboard",
]);

export function loginHref(path: string) {
  return returnPages.has(path) ? `/login?next=${encodeURIComponent(path)}` : "/login";
}

export function loginReturnPath(search: string) {
  const next = new URLSearchParams(search).get("next");
  return next && returnPages.has(next) ? next : "/";
}
