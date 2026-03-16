import { AttributeType } from "../../../shared/types";

export const ATTR_TYPES: { type: AttributeType | "action"; label: string }[] = [
  { type: "profession", label: "Профессия" },
  { type: "bio", label: "Биология" },
  { type: "health", label: "Здоровье" },
  { type: "hobby", label: "Хобби" },
  { type: "baggage", label: "Багаж" },
  { type: "fact", label: "Доп. факт" },
  { type: "action", label: "Особое условие" },
];
