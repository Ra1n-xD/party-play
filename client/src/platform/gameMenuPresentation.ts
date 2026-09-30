import type { RegisteredClientGameId } from "./gameRegistry";

interface GameMenuPresentation {
  kicker: string;
  tagline: string;
  description: string;
  punchline: string[];
}

export const gameMenuPresentation = {
  bunker: {
    kicker: "Допуск к выживанию",
    tagline: "Убедите всех, что без вас не выжить.",
    description:
      "За дверью — новая жизнь. Но мест хватит не всем. Раскройте свои карты и убедите компанию взять вас с собой.",
    punchline: ["МЕСТ", "ХВАТИТ", "НЕ ВСЕМ."],
  },
  durak: {
    kicker: "Карты на стол",
    tagline: "Дружба дружбой. А козырь — ваш.",
    description:
      "Знакомые правила, неожиданные ходы. Подкидывайте, отбивайтесь и оставьте последнюю карту кому-нибудь другому.",
    punchline: ["ПОДКИНЬ", "ДРУЗЬЯМ", "ИДЕЮ!"],
  },
  uno: {
    kicker: "Ещё по одной",
    tagline: "Яркие карты. Неожиданные повороты. И ещё одна партия.",
    description:
      "Меняйте цвет, разворачивайте игру и избавляйтесь от карт. Осталась одна? Не забудьте объявить об этом!",
    punchline: ["ОДНА КАРТА.", "МНОГО", "ЭМОЦИЙ."],
  },
} satisfies Record<RegisteredClientGameId, GameMenuPresentation>;
