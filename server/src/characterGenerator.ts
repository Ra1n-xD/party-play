import { Character, Attribute } from "../../shared/types.js";
import { professions } from "./data/professions.js";
import { healthConditions } from "./data/health.js";
import { hobbies } from "./data/hobbies.js";
import { baggage } from "./data/baggage.js";
import { facts } from "./data/facts.js";
import { biologyCards } from "./data/biology.js";
import { actionCards } from "./data/actions.js";
import { randomPick } from "./utils.js";

export function generateCharacter(usedProfessions: Set<string>): Character {
  let profession;
  let attempts = 0;
  do {
    profession = randomPick(professions);
    attempts++;
  } while (usedProfessions.has(profession.title) && attempts < 100);
  usedProfessions.add(profession.title);

  const bio = randomPick(biologyCards);
  const health = randomPick(healthConditions);
  const hobby = randomPick(hobbies);
  const bag = randomPick(baggage);
  const fact = randomPick(facts);
  const actionCard = randomPick(actionCards);
  // Build bio display value
  let bioValue = bio.title;
  if (bio.gender && bio.age !== null) {
    bioValue = `${bio.gender}, ${bio.age} лет`;
    if (bio.orientation && bio.orientation !== "Гетеро") {
      bioValue += `, ${bio.orientation}`;
    }
  }

  // 6 attributes per original rules: Profession, Biology, Health, Hobby, Baggage, Fact
  const attributes: Attribute[] = [
    {
      type: "profession",
      label: "Профессия",
      value: profession.title,
      image: profession.image,
    },
    {
      type: "bio",
      label: "Биология",
      value: bioValue,
      image: bio.image,
    },
    {
      type: "health",
      label: "Здоровье",
      value: health.title,
      image: health.image,
    },
    {
      type: "hobby",
      label: "Хобби",
      value: hobby.title,
      image: hobby.image,
    },
    {
      type: "baggage",
      label: "Багаж",
      value: bag.title,
      image: bag.image,
    },
    {
      type: "fact",
      label: "Доп. факт",
      value: fact.title,
      image: fact.image,
    },
  ];

  return {
    attributes,
    actionCard,
  };
}
