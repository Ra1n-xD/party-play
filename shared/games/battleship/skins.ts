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
    name: "Северные ладьи",
    rarity: "rare",
    hull: "#805231",
    deck: "#bd8a52",
    trim: "#f5dfaa",
    detail: "#462d27",
    accent: "#c76557",
  },
  {
    id: "corsair",
    name: "Призрачный флот",
    rarity: "epic",
    hull: "#284a50",
    deck: "#3d7777",
    trim: "#a8ead5",
    detail: "#162f37",
    accent: "#7cd9c7",
  },
  {
    id: "royal",
    name: "Морской дракон",
    rarity: "legendary",
    hull: "#234750",
    deck: "#b38150",
    trim: "#f3ca72",
    detail: "#182738",
    accent: "#a975d5",
  },
] as const;
export type ShipSkinId = (typeof SHIP_SKINS)[number]["id"];
export function getShipSkin(id: unknown) {
  return SHIP_SKINS.find((skin) => skin.id === id) ?? SHIP_SKINS[0];
}
export function isShipSkinId(id: unknown): id is ShipSkinId {
  return SHIP_SKINS.some((skin) => skin.id === id);
}
