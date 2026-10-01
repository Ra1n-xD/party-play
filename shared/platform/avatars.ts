/** Public cosmetics only; these characters never change game rules or hidden cards. */
export const AVATARS = [
  { id: "human", name: "Человек", skin: 0xe3af87, outfit: 0x7461ad, accent: 0x48322b },
  { id: "cat", name: "Кот", skin: 0x859aa9, outfit: 0x456a83, accent: 0xf2c1ba },
  { id: "dog", name: "Пёс", skin: 0xc39869, outfit: 0x438774, accent: 0x654333 },
  { id: "monkey", name: "Обезьяна", skin: 0x8a6045, outfit: 0x963f64, accent: 0xe5b483 },
  { id: "bear", name: "Медведь", skin: 0x88644d, outfit: 0x687c4e, accent: 0xd7b78e },
  { id: "panda", name: "Панда", skin: 0xf2eadb, outfit: 0x527c72, accent: 0x2a3037 },
  { id: "rabbit", name: "Кролик", skin: 0xe5ced6, outfit: 0xaf657b, accent: 0xe792aa },
  { id: "alien", name: "Пришелец", skin: 0x9ecf9a, outfit: 0x555caa, accent: 0x243541 },
  { id: "robot", name: "Робот", skin: 0xa3bbc7, outfit: 0x516d85, accent: 0x97eee0 },
  { id: "astronaut", name: "Космонавт", skin: 0xe3af87, outfit: 0xe7dbc2, accent: 0xe99358 },
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];
export type AvatarDefinition = (typeof AVATARS)[number];
export const DEFAULT_AVATAR_ID: AvatarId = "human";

export function isAvatarId(value: unknown): value is AvatarId {
  return AVATARS.some((avatar) => avatar.id === value);
}

export function getAvatar(value: unknown): AvatarDefinition {
  return AVATARS.find((avatar) => avatar.id === value) ?? AVATARS[0];
}
