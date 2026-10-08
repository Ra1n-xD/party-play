import { memoryRules } from "../games/memory/rules";
import { battleshipRules } from "../games/battleship/rules";
export const duelRegistry = {
  memory: { ...memoryRules, icon: "✦", subtitle: "Запоминайте. Открывайте. Собирайте пары." },
  battleship: {
    ...battleshipRules,
    icon: "⚓",
    subtitle: "Спрячьте флот. Найдите цель. Победите.",
  },
};
