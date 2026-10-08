import { getMoscowDay, nextMoscowMidnight } from "./dailyRewards.js";

export const PET_NEGLECT_MS = 7 * 86_400_000;
export const PET_BOOST_COST = 10;
export const PET_BOOST_GROWTH = 3;
export const PET_STAGES = ["Яйцо", "Малыш", "Подросток", "Взрослый"] as const;
export const PET_SPECIES = ["dragon", "cat", "fox", "rabbit", "owl", "dog"] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];
export const PET_SPECIES_INFO: Record<
  PetSpecies,
  { name: string; emoji: string; reaction: string }
> = {
  dragon: { name: "Дракончик", emoji: "🐉", reaction: "Р-р-р! Крылья к полёту готовы!" },
  cat: { name: "Котёнок", emoji: "🐱", reaction: "Мур-р! Держите лапку." },
  fox: { name: "Лисёнок", emoji: "🦊", reaction: "Фыр-фыр! Смотрите на мой хвост!" },
  rabbit: { name: "Кролик", emoji: "🐰", reaction: "Прыг-прыг! Кто выше?" },
  owl: { name: "Совёнок", emoji: "🦉", reaction: "Ух-ух! Обнимемся крыльями?" },
  dog: { name: "Собака", emoji: "🐶", reaction: "Гав! Давайте играть — я уже виляю хвостом!" },
};
export interface PetState {
  id: string;
  species: PetSpecies;
  bornAt: number;
  lastCareAt: number;
  growth: number;
  careDays: number;
  lastBoostDay: string | null;
}
export type PetAction = "adopt" | "care" | "boost";
export function petStage(pet: PetState): number {
  return pet.growth >= 30 ? 3 : pet.growth >= 10 ? 2 : pet.growth >= 3 ? 1 : 0;
}
export function petStatus(pet: PetState, now: number) {
  const alive = now < pet.lastCareAt + PET_NEGLECT_MS;
  const stage = petStage(pet);
  return {
    alive,
    stage,
    canCare: alive && getMoscowDay(pet.lastCareAt) !== getMoscowDay(now),
    canBoost: alive && stage < 3 && pet.lastBoostDay !== getMoscowDay(now),
    reward: 2 + stage,
    expiresAt: pet.lastCareAt + PET_NEGLECT_MS,
    nextCareAt: nextMoscowMidnight(pet.lastCareAt),
  };
}
export function validPet(pet: PetState): boolean {
  return (
    !!pet &&
    typeof pet.id === "string" &&
    PET_SPECIES.includes(pet.species) &&
    Number.isSafeInteger(pet.bornAt) &&
    Number.isSafeInteger(pet.lastCareAt) &&
    pet.lastCareAt >= pet.bornAt &&
    Number.isSafeInteger(pet.growth) &&
    pet.growth >= 0 &&
    pet.growth <= 30 &&
    Number.isSafeInteger(pet.careDays) &&
    pet.careDays >= 0 &&
    (pet.lastBoostDay === null || /^\d{4}-\d{2}-\d{2}$/.test(pet.lastBoostDay))
  );
}
