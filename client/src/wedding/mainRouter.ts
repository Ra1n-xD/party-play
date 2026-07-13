export type PartyPlayAppKind = "bunker" | "wedding-guest" | "wedding-admin" | "questions";

export function getPartyPlayAppKind(pathname: string): PartyPlayAppKind {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalized === "/wedding") return "wedding-guest";
  if (normalized === "/admin") return "wedding-admin";
  if (normalized === "/questions") return "questions";
  return "bunker";
}
