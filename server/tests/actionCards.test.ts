import assert from "node:assert/strict";
import test from "node:test";
import { actionCards } from "../src/data/actions.js";

const expectedCards = {
  buddy: [
    "Верный друг",
    "Разыграй после изгнания игрока. Верни в игру любого изгнанного игрока",
    true,
  ],
  double_vote: [
    "Второе мнение",
    "Замени одну свою открытую характеристику на случайную из колоды",
    false,
  ],
  discredit: ["Подрыв репутации", "Сбрось открытый дополнительный факт выбранного игрока", true],
  protect_left: ["Защити игрока слева", "Если изгнан игрок слева, верни его в игру", false],
  protect_right: ["Защити игрока справа", "Если изгнан игрок справа, верни его в игру", false],
  protect_youngest: [
    "Защити младшего",
    "Если изгнан самый младший из игроков с открытым возрастом, верни его в игру",
    false,
  ],
  protect_brave: [
    "Защити смелого",
    "До голосования выбери игрока. Если он изгнан, верни его в игру",
    true,
  ],
  protect_oldest: [
    "Защити старшего",
    "Если изгнан самый старший из игроков с открытым возрастом, верни его в игру",
    false,
  ],
  kompromat: [
    "Компромат",
    "Замени открытую профессию выбранного игрока на случайную из колоды",
    true,
  ],
  steal_baggage: ["Мне нужнее", "Поменяйся открытой картой багажа с выбранным игроком", true],
  silence: [
    "Запретная тема",
    "Выбери тип карт — все неизгнанные игроки немедленно раскрывают карту этого типа",
    false,
  ],
  plan_b: ["Запасной план", "Замени любую открытую карту бункера на случайную из колоды", false],
  secret_threat: [
    "Тайная диверсия",
    "Разыграй карту, только если ты изгнан. Сбрось любую открытую карту бункера",
    false,
  ],
  shuffle_baggage: [
    "Давайте начистоту: Багаж",
    "Собери все карты багажа у неизгнанных игроков, перемешай и перераздай",
    false,
  ],
  shuffle_bio: [
    "Давайте начистоту: Биология",
    "Собери все карты биологии у неизгнанных игроков, перемешай и перераздай",
    false,
  ],
  shuffle_health: [
    "Давайте начистоту: Здоровье",
    "Собери все карты здоровья у неизгнанных игроков, перемешай и перераздай",
    false,
  ],
  shuffle_facts: [
    "Давайте начистоту: Факты",
    "Собери все карты фактов у неизгнанных игроков, перемешай и перераздай",
    false,
  ],
  shuffle_hobby: [
    "Давайте начистоту: Хобби",
    "Собери все карты хобби у неизгнанных игроков, перемешай и перераздай",
    false,
  ],
  direct_question: [
    "Прямой вопрос",
    "Выбери тип карт — все неизгнанные игроки немедленно раскрывают карту этого типа",
    false,
  ],
} as const;

test("keeps 30 unique action-card ids", () => {
  assert.equal(actionCards.length, 30);
  assert.equal(new Set(actionCards.map((card) => card.id)).size, 30);
});

test("maps changed action cards to the approved admin-supported copy", () => {
  const cardsById = new Map(actionCards.map((card) => [card.id, card]));

  for (const [id, [title, description, targetRequired]] of Object.entries(expectedCards)) {
    const card = cardsById.get(id);
    assert.ok(card, `Missing action card: ${id}`);
    assert.deepEqual(
      {
        title: card.title,
        description: card.description,
        targetRequired: card.targetRequired,
      },
      { title, description, targetRequired },
    );
  }
});

test("removes mechanics unsupported by the admin panel", () => {
  const catalogText = actionCards.map((card) => `${card.title}\n${card.description}`).join("\n");

  for (const unsupported of [
    /голос считается за два/i,
    /голос выбранного игрока не учитывается/i,
    /голосовать против себя/i,
    /голоса против .* удваиваются/i,
    /переголосовать/i,
    /ещё 1 карту особых условий/i,
    /никто не говорит/i,
    /дополнительная угроза/i,
  ]) {
    assert.doesNotMatch(catalogText, unsupported);
  }
});
