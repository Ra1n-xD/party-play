# Action Card Admin Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite every unsupported or partially supported special-condition card so its effect maps to an existing host admin operation.

**Architecture:** Keep the existing display-only action-card workflow and change only the static catalog. Protect the catalog with a Node built-in test executed through the repository's existing `tsx` dependency; no Socket.IO, game-engine, or admin-UI changes are required.

**Tech Stack:** TypeScript, Node.js test runner, `tsx`, npm workspaces, Prettier

## Global Constraints

- Preserve all 30 existing card IDs and keep them unique.
- Do not add dependencies or modify voting, character inventory, threat state, Socket.IO events, or admin controls.
- Use only effects supported by shuffle, swap, replace, delete, force reveal, bunker remove/replace, revive, and eliminate admin operations.
- Preserve unrelated formatting and files; repository-wide Prettier already fails on `main`.

---

### Task 1: Add the action-card catalog contract test

**Files:**

- Create: `server/tests/actionCards.test.ts`

**Interfaces:**

- Consumes: `actionCards: ActionCard[]` from `server/src/data/actions.ts`
- Produces: a regression contract for card count, IDs, exact changed copy, target flags, and removed unsupported mechanics

- [ ] **Step 1: Write the failing test**

```ts
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
      { title: card.title, description: card.description, targetRequired: card.targetRequired },
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
```

- [ ] **Step 2: Run the test to verify it fails for the old catalog**

Run: `node --import tsx --test server/tests/actionCards.test.ts`

Expected: FAIL in `maps changed action cards to the approved admin-supported copy`, first reporting the old `buddy` title and description.

- [ ] **Step 3: Keep the failing test uncommitted for the implementation cycle**

Do not commit a red test on its own; continue directly to Task 2.

### Task 2: Rewrite the catalog to supported effects

**Files:**

- Modify: `server/src/data/actions.ts`
- Test: `server/tests/actionCards.test.ts`

**Interfaces:**

- Consumes: the exact copy contract from Task 1
- Produces: the same `ActionCard[]` export with 30 IDs and only admin-supported effects

- [ ] **Step 1: Apply the exact titles, descriptions, and target flags from the design**

Change the 19 entries enumerated in `expectedCards` so their `title`, `description`, and `targetRequired` fields match exactly. Leave the remaining 11 entries unchanged.

- [ ] **Step 2: Run the targeted test to verify it passes**

Run: `node --import tsx --test server/tests/actionCards.test.ts`

Expected: PASS, 3 tests and 0 failures.

- [ ] **Step 3: Format only the files owned by this task**

Run:

```bash
npx prettier --write server/src/data/actions.ts server/tests/actionCards.test.ts docs/superpowers/plans/2026-07-12-action-card-admin-coverage.md
```

Expected: all three files formatted without touching unrelated files.

- [ ] **Step 4: Re-run the targeted test after formatting**

Run: `node --import tsx --test server/tests/actionCards.test.ts`

Expected: PASS, 3 tests and 0 failures.

- [ ] **Step 5: Commit the catalog and regression test**

```bash
git add server/src/data/actions.ts server/tests/actionCards.test.ts docs/superpowers/plans/2026-07-12-action-card-admin-coverage.md
git commit -m "feat: align action cards with admin controls"
```

### Task 3: Verify the branch

**Files:**

- Verify: `server/src/data/actions.ts`
- Verify: `server/tests/actionCards.test.ts`

**Interfaces:**

- Consumes: completed catalog and regression test
- Produces: fresh evidence that tests, builds, formatting, and diff hygiene pass

- [ ] **Step 1: Run the targeted test**

Run: `node --import tsx --test server/tests/actionCards.test.ts`

Expected: PASS, 3 tests and 0 failures.

- [ ] **Step 2: Build both workspaces**

Run: `npm run build`

Expected: server TypeScript compilation and client Vite production build both exit 0.

- [ ] **Step 3: Check formatting only for changed files**

Run:

```bash
npx prettier --check server/src/data/actions.ts server/tests/actionCards.test.ts docs/superpowers/specs/2026-07-12-action-card-admin-coverage-design.md docs/superpowers/plans/2026-07-12-action-card-admin-coverage.md
```

Expected: all matched files use Prettier formatting.

- [ ] **Step 4: Inspect the final diff and repository state**

Run:

```bash
git diff --check main...HEAD
git status --short --branch
git log --oneline main..HEAD
```

Expected: no whitespace errors, a clean branch, and two commits: the design commit and the implementation commit.
