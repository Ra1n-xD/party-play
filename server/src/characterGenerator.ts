import { Character, Attribute } from '../../shared/types.js';
import { professions } from './data/professions.js';
import { healthConditions } from './data/health.js';
import { hobbies } from './data/hobbies.js';
import { baggage } from './data/baggage.js';
import { facts } from './data/facts.js';
import { actionCards } from './data/actions.js';
import { randomPick } from './utils.js';

function generateAge(): number {
  const base = Math.random() + Math.random() + Math.random();
  const normalized = base / 3;
  return Math.floor(18 + normalized * 62);
}

export function generateCharacter(usedProfessions: Set<string>): Character {
  let profession;
  let attempts = 0;
  do {
    profession = randomPick(professions);
    attempts++;
  } while (usedProfessions.has(profession.title) && attempts < 100);
  usedProfessions.add(profession.title);

  const age = generateAge();
  const gender = randomPick(['Мужчина', 'Женщина']);
  const actionCard = randomPick(actionCards);

  // 6 attributes per original rules: Profession, Biology, Health, Hobby, Baggage, Fact
  const attributes: Attribute[] = [
    {
      type: 'profession',
      label: 'Профессия',
      value: profession.title,
      detail: profession.description,
    },
    {
      type: 'bio',
      label: 'Биоданные',
      value: `${gender}, ${age} лет`,
    },
    {
      type: 'health',
      label: 'Здоровье',
      value: randomPick(healthConditions),
    },
    {
      type: 'hobby',
      label: 'Хобби',
      value: randomPick(hobbies),
    },
    {
      type: 'baggage',
      label: 'Багаж',
      value: randomPick(baggage),
    },
    {
      type: 'fact',
      label: 'Доп. факт',
      value: randomPick(facts),
    },
  ];

  return {
    attributes,
    actionCard,
    actionUsed: false,
  };
}
