export const SITE_URL = "https://partyside.fun";
export const SOCIAL_IMAGE = `${SITE_URL}/social-card.png`;
export const HOME_TAGLINE = "Онлайн-игры для своей компании — в браузере, без установки.";

export const publicGames = [
  {
    id: "bunker",
    name: "Бункер",
    players: "4–16 игроков",
    title: "Бункер онлайн с друзьями — играть в браузере | PartySide",
    description:
      "Играйте в Бункер онлайн компанией от 4 до 16 игроков. Раскрывайте персонажей, обсуждайте и голосуйте. Комнаты по коду, боты и 2D/3D на PartySide.",
  },
  {
    id: "durak",
    name: "Дурак",
    players: "2–6 игроков",
    title: "Дурак онлайн с друзьями — подкидной, с ботами | PartySide",
    description:
      "Подкидной Дурак онлайн для 2–6 игроков: 36 карт, комнаты по коду, боты и зрители. Играйте с друзьями в браузере за 2D или 3D-столом на PartySide.",
  },
  {
    id: "uno",
    name: "UNO",
    players: "2–10 игроков",
    title: "UNO онлайн с друзьями — играть в браузере | PartySide",
    description:
      "UNO онлайн для компании от 2 до 10 игроков. Цветные карты, комнаты по коду, боты и зрители. Играйте с друзьями без установки приложения на PartySide.",
  },
] as const;

export interface PageMetadata {
  path: string;
  title: string;
  description: string;
  indexable: boolean;
}

export const publicPages: PageMetadata[] = [
  {
    path: "/",
    title: "PartySide — онлайн-игры для компании и друзей",
    description:
      "Онлайн-игры для компании и друзей в браузере, без установки. Создавайте комнаты, делитесь кодом и играйте вместе с компьютера или телефона на PartySide.",
    indexable: true,
  },
  ...publicGames.map((game) => ({
    path: `/games/${game.id}`,
    title: game.title,
    description: game.description,
    indexable: true,
  })),
  {
    path: "/updates",
    title: "Обновления PartySide — новые возможности и история проекта",
    description:
      "Что нового в PartySide: игры, 3D-столы, персонажи, карты и эмоции. История обновлений платформы для игры с друзьями в браузере.",
    indexable: true,
  },
];

export const utilityPages = [
  ["/login", "Вход и регистрация"],
  ["/profile", "Коллекция"],
  ["/cases", "Кейсы"],
  ["/upgrade", "Улучшение предметов"],
  ["/leaderboard", "Рейтинг игроков"],
  ["/stats", "Статистика проекта"],
] as const;

export function getPageMetadata(path: string): PageMetadata {
  const normalized = path.replace(/\/$/, "") || "/";
  const publicPage = publicPages.find((page) => page.path === normalized);
  if (publicPage) return publicPage;
  const utility = utilityPages.find(([url]) => url === normalized);
  return {
    path: normalized,
    title: `${utility?.[1] ?? "Страница не найдена"} | PartySide`,
    description: utility
      ? "PartySide — игры для своей компании."
      : "Этой страницы нет в PartySide.",
    indexable: false,
  };
}

export function getStructuredData(path: string) {
  const page = getPageMetadata(path);
  const websiteId = `${SITE_URL}/#website`;
  const pageId = `${SITE_URL}${page.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: "PartySide",
        url: `${SITE_URL}/`,
        description: publicPages[0].description,
        inLanguage: "ru",
      },
      {
        "@type": "WebPage",
        "@id": pageId,
        url: pageId,
        name: page.title,
        description: page.description,
        isPartOf: { "@id": websiteId },
        inLanguage: "ru",
      },
    ],
  };
}
