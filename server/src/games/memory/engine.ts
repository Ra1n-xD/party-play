import { randomInt } from "node:crypto";
export interface MemoryState {
  kind: "memory";
  cards: number[];
  matched: boolean[];
  open: number[];
  scores: number[];
  turn: number;
  revealUntil: number;
}
export function createMemory(): MemoryState {
  const cards = Array.from({ length: 24 }, (_, i) => Math.floor(i / 2));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return {
    kind: "memory",
    cards,
    matched: cards.map(() => false),
    open: [],
    scores: [0, 0],
    turn: randomInt(2),
    revealUntil: 0,
  };
}
export function flipMemory(state: MemoryState, actor: number, cell: number, now: number): boolean {
  if (state.turn !== actor || now < state.revealUntil) throw new Error("Дождитесь своего хода");
  if (!Number.isInteger(cell) || cell < 0 || cell >= 24 || state.matched[cell])
    throw new Error("Выберите закрытую карту");
  if (state.open.length === 2) state.open = [];
  if (state.open.includes(cell)) throw new Error("Эта карта уже открыта");
  state.open.push(cell);
  if (state.open.length === 2) {
    const [a, b] = state.open;
    if (state.cards[a] === state.cards[b]) {
      state.matched[a] = state.matched[b] = true;
      state.scores[actor]++;
    }
    // Each player opens exactly two cards per turn, including after finding a pair.
    state.turn = 1 - actor;
    state.revealUntil = now + 1800;
  }
  return state.matched.every(Boolean);
}
