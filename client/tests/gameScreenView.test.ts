import assert from "node:assert/strict";
import test from "node:test";
import type { Character, PlayerInfo } from "../../shared/types";
import {
  buildPlayerAttributeSlots,
  countRevealedCards,
  getInitials,
  getPlayerStateLabel,
} from "../src/screens/gameScreenView";

const player: PlayerInfo = {
  id: "p1",
  name: "Анна Смирнова",
  ready: true,
  connected: true,
  alive: true,
  revealedAttributes: [{ type: "profession", label: "Профессия", value: "Хирург" }],
  actionCardRevealed: false,
  isHost: false,
  isBot: false,
};

const character: Character = {
  attributes: [
    { type: "profession", label: "Профессия", value: "Хирург" },
    { type: "bio", label: "Биология", value: "34 года · женщина" },
    { type: "health", label: "Здоровье", value: "Идеальное здоровье" },
    { type: "hobby", label: "Хобби", value: "Скалолазание" },
    { type: "baggage", label: "Багаж", value: "Полевая аптечка" },
    { type: "fact", label: "Особый факт", value: "Знает три языка" },
  ],
  actionCard: {
    id: "a1",
    title: "Иммунитет",
    description: "Иммунитет к первому изгнанию",
    targetRequired: false,
  },
};

test("public player slots never contain private values", () => {
  const slots = buildPlayerAttributeSlots(player, false, character);

  assert.equal(slots.length, 7);
  assert.equal(slots[0].value, "Хирург");
  assert.equal(slots[1].value, null);
  assert.equal(slots[6].value, null);
});

test("owner slots contain all private values and preserve reveal state", () => {
  const slots = buildPlayerAttributeSlots(player, true, character);

  assert.equal(slots[1].value, "34 года · женщина");
  assert.equal(slots[1].isPublic, false);
  assert.equal(slots[0].isPublic, true);
  assert.equal(slots[6].value, "Иммунитет");
});

test("view counters include revealed action cards", () => {
  assert.equal(countRevealedCards([player, { ...player, id: "p2", actionCardRevealed: true }]), 3);
  assert.equal(getInitials("Анна Смирнова"), "АС");
});

test("last eliminated player keeps the voting status", () => {
  assert.equal(
    getPlayerStateLabel({ ...player, alive: false }, null, player.id),
    "Изгнан · голосует",
  );
});

test("action details are visible only after a public reveal", () => {
  const actionCard = character.actionCard;
  const hiddenSlots = buildPlayerAttributeSlots({ ...player, actionCard }, false, character);
  const revealedSlots = buildPlayerAttributeSlots(
    { ...player, actionCard, actionCardRevealed: true },
    false,
    character,
  );

  assert.equal(hiddenSlots[6].value, null);
  assert.equal(hiddenSlots[6].detail, undefined);
  assert.equal(revealedSlots[6].value, actionCard.title);
  assert.equal(revealedSlots[6].detail, actionCard.description);
});
