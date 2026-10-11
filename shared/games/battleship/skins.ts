/** Shared by inventory previews and the fleet on the board. Cosmetics never change rules. */
export const SHIP_SKINS = [
  {
    id: "classic",
    name: "Стальной флот",
    rarity: "basic",
    hull: "#617b92",
    deck: "#c0ccd5",
    trim: "#e8f0ed",
    detail: "#304556",
    accent: "#f6b65a",
  },
  {
    id: "coastal",
    name: "Береговая охрана",
    rarity: "common",
    hull: "#cf613f",
    deck: "#ffe5bd",
    trim: "#fff8e8",
    detail: "#854233",
    accent: "#65d6dc",
  },
  {
    id: "arctic",
    name: "Полярный конвой",
    rarity: "rare",
    hull: "#8bbcc9",
    deck: "#f1f9f4",
    trim: "#c4f5f0",
    detail: "#3c6c89",
    accent: "#6aa2d9",
  },
  {
    id: "corsair",
    name: "Корсары",
    rarity: "epic",
    hull: "#684433",
    deck: "#b37f52",
    trim: "#efc989",
    detail: "#342837",
    accent: "#e77e6e",
  },
  {
    id: "royal",
    name: "Золотая армада",
    rarity: "legendary",
    hull: "#283446",
    deck: "#546076",
    trim: "#f4d07b",
    detail: "#151e31",
    accent: "#f7df9d",
  },
] as const;
export type ShipSkinId = (typeof SHIP_SKINS)[number]["id"];
export function getShipSkin(id: unknown) {
  return SHIP_SKINS.find((skin) => skin.id === id) ?? SHIP_SKINS[0];
}
export function isShipSkinId(id: unknown): id is ShipSkinId {
  return SHIP_SKINS.some((skin) => skin.id === id);
}
