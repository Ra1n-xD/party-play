# GameScreen Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перестроить только `GameScreen` в адаптивный «командный центр», где фаза и действие заметны сразу, игроки удобно сравниваются, а личное досье остаётся читаемым на десктопе и мобильных устройствах.

**Architecture:** `GameScreen` остаётся единственной точкой обращения к `GameContext`, вычисляет экранную модель через чистую функцию и передаёт данные небольшим презентационным компонентам. Десктоп использует двухколоночную рабочую область, мобильная версия — доступный tablist с тремя панелями; все новые стили изолированы корневым классом `.command-game-screen`, поэтому `VoteScreen` не меняется.

**Tech Stack:** React 18, TypeScript 5.6, Vite 5, React Icons, Node test runner через `node --import tsx --test`, CSS Grid/Flexbox.

## Global Constraints

- Изменять только визуал и локальное UI-поведение `GameScreen`; не менять `VoteScreen`, `ResultsScreen`, `LobbyScreen` и глобальные overlay-анимации.
- Не менять Socket.IO-события, серверную логику, `PublicGameState`, `Character` и правила раскрытия карт.
- Не переносить приватный `myCharacter` в публичные карточки игроков.
- Максимальная ширина экрана: `1200px`.
- Desktop: `min-width: 1024px`; tablet: `769px–1023px`; mobile: `max-width: 768px`.
- На mobile использовать вкладки `Игроки`, `Персонаж`, `Ситуация`; по умолчанию открывать `Игроки`.
- Основные сенсорные элементы должны быть не меньше `44px` по меньшей стороне.
- Не создавать Git-коммиты, не выполнять push и не изменять историю Git. Пользователь самостоятельно выполняет все Git-операции.
- Существующие пользовательские изменения `D CLAUDE.md` и `?? AGENTS.md` не трогать.

## File Map

- Create: `client/src/screens/game/gameScreenViewModel.ts` — чистое вычисление ролей, статусов, фазовой подсказки и доступных действий.
- Create: `client/tests/game-screen/GameScreen.test.tsx` — unit- и server-render тесты экрана вне клиентской TypeScript-сборки.
- Create: `client/src/screens/game/GameStatusHeader.tsx` — sticky-шапка фазы, раундов, таймера и действий хоста.
- Create: `client/src/screens/game/ScenarioSummary.tsx` — компактная ситуация и полные сведения о катастрофе, бункере и угрозе.
- Create: `client/src/screens/game/CharacterDossier.tsx` — приватное досье с читаемыми статусами раскрытия.
- Create: `client/src/screens/game/PlayerBoard.tsx` — доступная сетка публичных карточек игроков.
- Create: `client/src/screens/game/MobileGameTabs.tsx` — tablist и три mobile-панели.
- Create: `client/src/screens/game/HostControlDialog.tsx` — все существующие операции хоста и подтверждение завершения игры.
- Create: `client/src/styles/game-screen.css` — полностью scoped стили нового экрана и responsive-правила.
- Modify: `client/src/screens/GameScreen.tsx` — orchestration, модальные окна раскрытия и композиция новых секций.
- Modify: `package.json` — команда `test:game-screen` без новых зависимостей.

---

### Task 1: Extract and test the GameScreen view model

**Files:**

- Create: `client/src/screens/game/gameScreenViewModel.ts`
- Create: `client/tests/game-screen/GameScreen.test.tsx`
- Modify: `package.json`

**Interfaces:**

- Consumes: `ClientGameState`, `Character`, `PlayerInfo`, `AttributeType`.
- Produces: `MobileGameTab`, `GameScreenViewModel`, `buildGameScreenViewModel()` and `getAdminActionReadiness()`.

- [ ] **Step 1: Add the local test command**

Add this root script without changing dependencies:

```json
"test:game-screen": "TSX_TSCONFIG_PATH=client/tsconfig.json node --import tsx --test client/tests/game-screen/GameScreen.test.tsx"
```

Run: `npm run test:game-screen`

Expected: FAIL because the test files do not exist yet or Node reports no matching test files.

- [ ] **Step 2: Write failing view-model tests**

Create `client/tests/game-screen/GameScreen.test.tsx` with typed fixtures and these cases:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { Character, PlayerInfo } from "../../../shared/types";
import type { ClientGameState } from "../../src/context/GameContext";
import {
  buildGameScreenViewModel,
  getAdminActionReadiness,
} from "../../src/screens/game/gameScreenViewModel";

const character: Character = {
  attributes: [
    { type: "profession", label: "Профессия", value: "Врач" },
    { type: "bio", label: "Биология", value: "Женщина, 32 года" },
    { type: "health", label: "Здоровье", value: "Здорова" },
  ],
  actionCard: {
    id: "action-1",
    title: "План Б",
    description: "Повторное голосование",
    targetRequired: false,
  },
};

const me: PlayerInfo = {
  id: "me",
  name: "Анна",
  ready: true,
  connected: true,
  alive: true,
  revealedAttributes: [{ type: "profession", label: "Профессия", value: "Врач" }],
  actionCardRevealed: false,
  isHost: true,
  isBot: false,
};

const other: PlayerInfo = {
  ...me,
  id: "other",
  name: "Михаил",
  revealedAttributes: [],
  isHost: false,
};

const state: ClientGameState = {
  phase: "ROUND_REVEAL",
  roundNumber: 2,
  totalRounds: 5,
  catastrophe: { title: "Инопланетяне", description: "Вторжение" },
  revealedBunkerCards: [],
  totalBunkerCards: 3,
  threatCard: null,
  bunkerCapacity: 2,
  players: [me, other],
  currentTurnPlayerId: "me",
  votesCount: 0,
  totalVotesExpected: 0,
  voteResults: null,
  eliminatedPlayerId: null,
  votingSchedule: [1, 1, 0, 0, 0],
  currentVotingInRound: 0,
  votingsInCurrentRound: 1,
  lastEliminatedPlayerId: null,
  tiebreakCandidateIds: null,
  phaseRemainingMs: 40_000,
  phaseEndTime: 40_000,
  paused: false,
  spectatorCount: 0,
};

test("marks matched attributes as public while keeping the rest available", () => {
  const view = buildGameScreenViewModel({
    gameState: state,
    playerId: "me",
    isSpectator: false,
    myCharacter: character,
  });

  assert.deepEqual([...view.revealedIndices], [0]);
  assert.deepEqual(view.unrevealedIndices, [1, 2]);
  assert.equal(view.canReveal, true);
  assert.equal(view.phaseDescription, "Ваш ход — выберите характеристику");
});

test("does not instruct the player to reveal when only one private card remains", () => {
  const nearlyComplete = {
    ...state,
    players: [
      {
        ...me,
        revealedAttributes: character.attributes.slice(0, 2),
      },
      other,
    ],
  };
  const view = buildGameScreenViewModel({
    gameState: nearlyComplete,
    playerId: "me",
    isSpectator: false,
    myCharacter: character,
  });

  assert.equal(view.canReveal, false);
  assert.equal(view.phaseDescription, "Все доступные характеристики уже раскрыты");
});

test("spectators never receive private actions", () => {
  const view = buildGameScreenViewModel({
    gameState: state,
    playerId: "spectator",
    isSpectator: true,
    myCharacter: null,
  });

  assert.equal(view.me, undefined);
  assert.equal(view.canReveal, false);
  assert.equal(view.canRevealAction, false);
});

test("validates host operation selections", () => {
  assert.equal(
    getAdminActionReadiness("swap", {
      player1: "me",
      player2: "other",
      players: new Set(),
      attributeTypes: new Set(),
      bunkerCardIndex: null,
    }),
    true,
  );
  assert.equal(
    getAdminActionReadiness("replace", {
      player1: "",
      player2: "",
      players: new Set(["me"]),
      attributeTypes: new Set(["health"]),
      bunkerCardIndex: null,
    }),
    true,
  );
  assert.equal(
    getAdminActionReadiness("removeBunker", {
      player1: "",
      player2: "",
      players: new Set(),
      attributeTypes: new Set(),
      bunkerCardIndex: null,
    }),
    false,
  );
});
```

- [ ] **Step 3: Run the tests and confirm the red state**

Run: `npm run test:game-screen`

Expected: FAIL with `Cannot find module './gameScreenViewModel'`.

- [ ] **Step 4: Implement the pure view model**

Create `client/src/screens/game/gameScreenViewModel.ts` with these exported contracts and behavior:

```ts
import type { AttributeType, Character, PlayerInfo } from "../../../../shared/types";
import type { ClientGameState } from "../../context/GameContext";

export type MobileGameTab = "players" | "character" | "situation";

export type AdminAction =
  | "shuffle"
  | "swap"
  | "replace"
  | "deleteAttr"
  | "forceReveal"
  | "removeBunker"
  | "replaceBunker"
  | "revive"
  | "eliminate";

export interface AdminSelection {
  player1: string;
  player2: string;
  players: Set<string>;
  attributeTypes: Set<AttributeType | "action">;
  bunkerCardIndex: number | null;
}

export interface GameScreenViewModel {
  me?: PlayerInfo;
  alivePlayers: PlayerInfo[];
  isMyTurn: boolean;
  revealedIndices: Set<number>;
  unrevealedIndices: number[];
  canReveal: boolean;
  canRevealAction: boolean;
  hasBottomAction: boolean;
  phaseLabel: string;
  phaseDescription: string;
  votingInfo: string;
}

interface BuildViewModelArgs {
  gameState: ClientGameState;
  playerId: string | null;
  isSpectator: boolean;
  myCharacter: Character | null;
}

const PHASE_LABELS: Partial<Record<ClientGameState["phase"], string>> = {
  CATASTROPHE_REVEAL: "Катастрофа",
  BUNKER_EXPLORE: "Исследование бункера",
  ROUND_REVEAL: "Раскрытие карт",
  ROUND_DISCUSSION: "Обсуждение",
  ROUND_RESULT: "Результат раунда",
};

function getRevealedIndices(character: Character | null, player?: PlayerInfo): Set<number> {
  const result = new Set<number>();
  if (!character || !player) return result;

  for (const revealed of player.revealedAttributes) {
    const index = character.attributes.findIndex(
      (attribute, candidateIndex) =>
        !result.has(candidateIndex) &&
        attribute.type === revealed.type &&
        attribute.value === revealed.value,
    );
    if (index >= 0) result.add(index);
  }
  return result;
}

export function buildGameScreenViewModel({
  gameState,
  playerId,
  isSpectator,
  myCharacter,
}: BuildViewModelArgs): GameScreenViewModel {
  const me = isSpectator ? undefined : gameState.players.find((player) => player.id === playerId);
  const isMyTurn = Boolean(me && gameState.currentTurnPlayerId === me.id);
  const revealedIndices = getRevealedIndices(myCharacter, me);
  const unrevealedIndices = myCharacter
    ? myCharacter.attributes.map((_, index) => index).filter((index) => !revealedIndices.has(index))
    : [];
  const canReveal =
    Boolean(me) && gameState.phase === "ROUND_REVEAL" && isMyTurn && unrevealedIndices.length > 1;
  const canRevealAction = Boolean(me && myCharacter?.actionCard && !me.actionCardRevealed);

  let phaseDescription = "Следите за ходом игры";
  if (gameState.phase === "CATASTROPHE_REVEAL") phaseDescription = "Ознакомьтесь с ситуацией";
  if (gameState.phase === "BUNKER_EXPLORE") phaseDescription = "Открыта новая карта бункера";
  if (gameState.phase === "ROUND_DISCUSSION")
    phaseDescription = "Обсудите, кого оставить за пределами бункера";
  if (gameState.phase === "ROUND_RESULT") phaseDescription = "Подведены итоги голосования";
  if (gameState.phase === "ROUND_REVEAL") {
    if (isMyTurn && canReveal) {
      phaseDescription =
        gameState.roundNumber === 1
          ? "Ваш ход — раскройте профессию"
          : "Ваш ход — выберите характеристику";
    } else if (isMyTurn) {
      phaseDescription = "Все доступные характеристики уже раскрыты";
    } else {
      const current = gameState.players.find(
        (player) => player.id === gameState.currentTurnPlayerId,
      );
      phaseDescription = current ? `Сейчас ходит ${current.name}` : "Ожидаем следующего игрока";
    }
  }

  return {
    me,
    alivePlayers: gameState.players.filter((player) => player.alive),
    isMyTurn,
    revealedIndices,
    unrevealedIndices,
    canReveal,
    canRevealAction,
    hasBottomAction: canReveal || canRevealAction,
    phaseLabel: PHASE_LABELS[gameState.phase] ?? gameState.phase,
    phaseDescription,
    votingInfo:
      gameState.votingsInCurrentRound > 0
        ? `Голосование ${gameState.currentVotingInRound + 1} из ${gameState.votingsInCurrentRound}`
        : "",
  };
}

export function getAdminActionReadiness(action: AdminAction, selection: AdminSelection): boolean {
  if (action === "swap") {
    return Boolean(
      selection.player1 && selection.player2 && selection.player1 !== selection.player2,
    );
  }
  if (action === "replace" || action === "deleteAttr") {
    return selection.players.size > 0 && selection.attributeTypes.size > 0;
  }
  if (action === "removeBunker" || action === "replaceBunker") {
    return selection.bunkerCardIndex !== null;
  }
  if (action === "revive" || action === "eliminate") {
    return Boolean(selection.player1);
  }
  return true;
}
```

- [ ] **Step 5: Run the tests and confirm the green state**

Run: `npm run test:game-screen`

Expected: 4 tests pass, 0 fail.

- [ ] **Step 6: Review without committing**

Run: `git diff --check -- package.json client/src/screens/game/gameScreenViewModel.ts client/tests/game-screen/GameScreen.test.tsx`

Expected: no output. Do not stage, commit, or push.

---

### Task 2: Build the status header and scenario summary

**Files:**

- Create: `client/src/screens/game/GameStatusHeader.tsx`
- Create: `client/src/screens/game/ScenarioSummary.tsx`
- Modify: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: `ClientGameState`, phase copy from Task 1, callbacks owned by `GameScreen`.
- Produces: `GameStatusHeader` and `ScenarioSummary` React components.

- [ ] **Step 1: Write failing server-render semantic tests**

Append the following imports, fixture, and tests to `GameScreen.test.tsx`; merge all imports at the top of the file:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GameStatusHeader } from "../../src/screens/game/GameStatusHeader";
import { ScenarioSummary } from "../../src/screens/game/ScenarioSummary";
import type { ClientGameState } from "../../src/context/GameContext";

const state = {
  phase: "ROUND_REVEAL",
  roundNumber: 2,
  totalRounds: 5,
  catastrophe: { title: "Инопланетяне", description: "Началось вторжение" },
  revealedBunkerCards: [{ title: "Генератор", description: "Запас энергии" }],
  totalBunkerCards: 3,
  threatCard: null,
  bunkerCapacity: 2,
  players: [],
  currentTurnPlayerId: null,
  votesCount: 0,
  totalVotesExpected: 0,
  voteResults: null,
  eliminatedPlayerId: null,
  votingSchedule: [],
  currentVotingInRound: 0,
  votingsInCurrentRound: 0,
  lastEliminatedPlayerId: null,
  tiebreakCandidateIds: null,
  phaseRemainingMs: null,
  phaseEndTime: null,
  paused: false,
  spectatorCount: 0,
} satisfies ClientGameState;

test("status header exposes phase and round progress", () => {
  const html = renderToStaticMarkup(
    <GameStatusHeader
      gameState={state}
      phaseLabel="Раскрытие карт"
      phaseDescription="Сейчас ходит Михаил"
      votingInfo=""
      isMyTurn={false}
      connected={true}
      canSkipDiscussion={false}
      canManageGame={false}
      onSkipDiscussion={() => undefined}
      onOpenHostControls={() => undefined}
    />,
  );
  assert.match(html, /aria-label="Состояние игры"/);
  assert.match(html, /Раунд 2 из 5/);
  assert.match(html, /Раскрытие карт/);
});

test("scenario toggle reports its expanded state", () => {
  const html = renderToStaticMarkup(
    <ScenarioSummary
      idPrefix="test-scenario"
      gameState={state}
      expanded={false}
      onToggle={() => undefined}
    />,
  );
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Инопланетяне/);
  assert.match(html, /1 из 3/);
  assert.doesNotMatch(html, /Началось вторжение/);
});
```

Run: `npm run test:game-screen`

Expected: FAIL because both components are missing.

- [ ] **Step 2: Implement `GameStatusHeader`**

Use this props contract:

```tsx
interface GameStatusHeaderProps {
  gameState: ClientGameState;
  phaseLabel: string;
  phaseDescription: string;
  votingInfo: string;
  isMyTurn: boolean;
  connected: boolean;
  canSkipDiscussion: boolean;
  canManageGame: boolean;
  onSkipDiscussion: () => void;
  onOpenHostControls: () => void;
}
```

Render a `<header className="gs-status-header" aria-label="Состояние игры">` containing:

```tsx
<div className="gs-status-copy">
  <span className="gs-eyebrow">Раунд {gameState.roundNumber} из {gameState.totalRounds}</span>
  <h1>{phaseLabel}</h1>
  <p>{phaseDescription}</p>
</div>
<div className="gs-round-progress" aria-label={`Раунд ${gameState.roundNumber} из ${gameState.totalRounds}`}>
  {Array.from({ length: gameState.totalRounds }, (_, index) => (
    <span
      key={index}
      className={`gs-round-step ${index + 1 < gameState.roundNumber ? "is-complete" : ""} ${index + 1 === gameState.roundNumber ? "is-current" : ""}`}
      aria-hidden="true"
    >
      {index + 1}
    </span>
  ))}
</div>
<div className="gs-status-actions">
  {!connected && <span className="gs-connection-status">Нет соединения</span>}
  {votingInfo && <span className="gs-voting-status">{votingInfo}</span>}
  <Timer endTime={gameState.phaseEndTime} size="large" />
  {canSkipDiscussion && <button className="btn btn-secondary" onClick={onSkipDiscussion}>Пропустить обсуждение</button>}
  {canManageGame && <button className="btn btn-secondary" onClick={onOpenHostControls}>Управление</button>}
</div>
```

Add `is-my-turn` to the header when `isMyTurn` is true. Do not use a looping pulse animation.

- [ ] **Step 3: Implement `ScenarioSummary`**

Use this contract:

```tsx
interface ScenarioSummaryProps {
  idPrefix: string;
  gameState: ClientGameState;
  expanded: boolean;
  onToggle: () => void;
  alwaysExpanded?: boolean;
}
```

Render a semantic `<section className="gs-scenario" aria-labelledby={`${idPrefix}-title`}>`. Compute `const isOpen = alwaysExpanded || expanded`. When `alwaysExpanded` is false, the summary is a `<button>` with `aria-expanded={isOpen}` and `aria-controls={`${idPrefix}-details`}`. When `alwaysExpanded` is true, render the same summary content in a non-interactive heading row because the mobile Situation panel is already the expanded destination. The summary contains catastrophe title, `${revealed}/${total}` bunker count, capacity, and threat status. Render the details element with `id={`${idPrefix}-details`}` only when `isOpen`; preserve the order of `revealedBunkerCards` and apply `is-new` to the final card only during `BUNKER_EXPLORE`. The required `idPrefix` prevents duplicate IDs because desktop and mobile scenario instances coexist in the DOM.

The detailed area must contain catastrophe description, bunker cards, capacity, and threat title/description. Do not render private character data.

- [ ] **Step 4: Run tests**

Run: `npm run test:game-screen`

Expected: 6 tests pass, 0 fail.

- [ ] **Step 5: Review without committing**

Run: `git diff --check -- client/src/screens/game/GameStatusHeader.tsx client/src/screens/game/ScenarioSummary.tsx client/tests/game-screen/GameScreen.test.tsx`

Expected: no output. Do not stage, commit, or push.

---

### Task 3: Build the player board and private dossier

**Files:**

- Create: `client/src/screens/game/PlayerBoard.tsx`
- Create: `client/src/screens/game/CharacterDossier.tsx`
- Modify: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: public `PlayerInfo[]`, private `Character`, and `revealedIndices` from Task 1.
- Produces: `PlayerBoard`, `PlayerCard`, and `CharacterDossier`.

- [ ] **Step 1: Add failing semantic and privacy tests**

Append tests that render:

```tsx
import type { Character, PlayerInfo } from "../../../shared/types";
import { CharacterDossier } from "../../src/screens/game/CharacterDossier";
import { PlayerBoard } from "../../src/screens/game/PlayerBoard";

const player = {
  id: "player-1",
  name: "Анна",
  ready: true,
  connected: true,
  alive: true,
  revealedAttributes: [{ type: "profession", label: "Профессия", value: "Врач" }],
  actionCardRevealed: false,
  isHost: false,
  isBot: false,
} satisfies PlayerInfo;

const privateCharacter = {
  attributes: [
    { type: "profession", label: "Профессия", value: "Врач" },
    { type: "bio", label: "Биология", value: "Женщина, 32 года" },
  ],
  actionCard: {
    id: "action-1",
    title: "План Б",
    description: "Повторное голосование",
    targetRequired: false,
  },
} satisfies Character;

test("player board uses buttons and only public attributes", () => {
  const html = renderToStaticMarkup(
    <PlayerBoard
      players={[player]}
      playerId="player-1"
      currentTurnPlayerId="player-1"
      lastEliminatedPlayerId={null}
      onSelectPlayer={() => undefined}
    />,
  );
  assert.match(html, /<button/);
  assert.match(html, /Врач/);
  assert.doesNotMatch(html, /План Б/);
});

test("private hidden cards stay readable and explain visibility", () => {
  const html = renderToStaticMarkup(
    <CharacterDossier
      character={privateCharacter}
      revealedIndices={new Set([0])}
      alive={true}
      actionCardRevealed={false}
    />,
  );
  assert.match(html, /Женщина, 32 года/);
  assert.match(html, /Видно только вам/);
  assert.match(html, /Раскрыто всем/);
  assert.match(html, /План Б/);
});
```

Merge these imports with the existing imports at the top of the test file; do not duplicate import declarations.

Run: `npm run test:game-screen`

Expected: FAIL because the components are missing.

- [ ] **Step 2: Implement `PlayerBoard` and `PlayerCard`**

Use this public-only contract:

```tsx
interface PlayerBoardProps {
  players: PlayerInfo[];
  playerId: string | null;
  currentTurnPlayerId: string | null;
  lastEliminatedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
}
```

The board heading is `Игроки` with `${aliveCount} в игре`. Each player is a real button:

```tsx
<button
  type="button"
  className={classNames}
  onClick={() => onSelectPlayer(player.id)}
  aria-label={`Открыть карточку игрока ${player.name}`}
>
  <span className="gs-player-heading">
    <span className="gs-player-number">{index + 1}</span>
    <strong>{player.name}</strong>
    {isMe && <span className="gs-status-pill">Вы</span>}
    {player.isBot && <span className="gs-status-pill">BOT</span>}
  </span>
  <span className="gs-player-states">
    {!player.alive && <span>Изгнан</span>}
    {!player.connected && !player.isBot && <span>Отключён</span>}
    {isCurrentTurn && <span>Сейчас ходит</span>}
    {isLastEliminated && <span>Голосует в этом раунде</span>}
  </span>
  <span className="gs-public-attributes">
    {player.revealedAttributes.length === 0 && !player.actionCard ? (
      <span className="gs-empty-copy">Пока ничего не раскрыто</span>
    ) : (
      <>
        {player.revealedAttributes.map((attribute, attributeIndex) => (
          <span
            key={`${attribute.type}-${attributeIndex}`}
            className="gs-public-attribute"
            data-attr-type={attribute.type}
          >
            <span>{attribute.label}</span>
            <strong>{attribute.value}</strong>
          </span>
        ))}
        {player.actionCard && (
          <span className="gs-public-attribute" data-attr-type="action">
            <span>Особое условие</span>
            <strong>{player.actionCard.title}</strong>
          </span>
        )}
      </>
    )}
  </span>
</button>
```

Build `classNames` from `is-me`, `is-current-turn`, `is-eliminated`, and `is-disconnected`. Do not read `myCharacter` in this file.

- [ ] **Step 3: Implement `CharacterDossier`**

Use:

```tsx
interface CharacterDossierProps {
  character: Character;
  revealedIndices: Set<number>;
  alive: boolean;
  actionCardRevealed: boolean;
}
```

Render all six attributes plus the action card. Every private item keeps normal opacity. For each attribute render `CardImage`, label, value, detail, and one of:

```tsx
{
  isRevealed ? (
    <span className="gs-card-visibility is-public">Раскрыто всем</span>
  ) : (
    <span className="gs-card-visibility is-private">Видно только вам · Не раскрыто</span>
  );
}
```

Apply the same rule to the action card using `actionCardRevealed`. Show `Изгнан` next to the dossier heading when `alive` is false.

- [ ] **Step 4: Run tests**

Run: `npm run test:game-screen`

Expected: 8 tests pass, 0 fail.

- [ ] **Step 5: Review without committing**

Run: `git diff --check -- client/src/screens/game/PlayerBoard.tsx client/src/screens/game/CharacterDossier.tsx client/tests/game-screen/GameScreen.test.tsx`

Expected: no output. Do not stage, commit, or push.

---

### Task 4: Build accessible mobile tabs

**Files:**

- Create: `client/src/screens/game/MobileGameTabs.tsx`
- Modify: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: `MobileGameTab` from Task 1 and three React nodes owned by `GameScreen`.
- Produces: one tablist and matching tabpanels without duplicating private data into `PlayerBoard`.

- [ ] **Step 1: Add a failing tab semantics test**

Append:

```tsx
test("mobile tabs connect selected tabs to their panels", () => {
  const html = renderToStaticMarkup(
    <MobileGameTabs
      activeTab="players"
      showCharacter={true}
      onChange={() => undefined}
      players={<div>Список игроков</div>}
      character={<div>Личное досье</div>}
      situation={<div>Катастрофа</div>}
    />,
  );
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /aria-controls="gs-mobile-panel-players"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /Личное досье/);
});
```

Run: `npm run test:game-screen`

Expected: FAIL because `MobileGameTabs` is missing.

- [ ] **Step 2: Implement the tabs**

Use this contract:

```tsx
interface MobileGameTabsProps {
  activeTab: MobileGameTab;
  showCharacter: boolean;
  onChange: (tab: MobileGameTab) => void;
  players: ReactNode;
  character: ReactNode;
  situation: ReactNode;
}
```

Create the ordered tab definition:

```ts
const tabs: { id: MobileGameTab; label: string }[] = [
  { id: "players", label: "Игроки" },
  { id: "character", label: "Персонаж" },
  { id: "situation", label: "Ситуация" },
];
```

Filter out `character` when `showCharacter` is false. Each tab button must use `role="tab"`, `id="gs-mobile-tab-${id}"`, `aria-controls="gs-mobile-panel-${id}"`, and `aria-selected`. Each panel must always remain in the DOM, use `role="tabpanel"`, `aria-labelledby`, and the native `hidden` attribute when inactive.

- [ ] **Step 3: Run tests**

Run: `npm run test:game-screen`

Expected: 9 tests pass, 0 fail.

- [ ] **Step 4: Review without committing**

Run: `git diff --check -- client/src/screens/game/MobileGameTabs.tsx client/tests/game-screen/GameScreen.test.tsx`

Expected: no output. Do not stage, commit, or push.

---

### Task 5: Extract host controls into a responsive dialog

**Files:**

- Create: `client/src/screens/game/HostControlDialog.tsx`
- Modify: `client/tests/game-screen/GameScreen.test.tsx`

**Interfaces:**

- Consumes: `ClientGameState`, `ATTR_TYPES`, `toggleInSet`, all existing admin callbacks.
- Produces: `HostControlDialog` that owns temporary form state and calls existing server-authoritative actions.

- [ ] **Step 1: Add failing dialog tests**

Append these imports and tests, merging the imports with the top of the file:

```tsx
import type { ComponentProps } from "react";
import { HostControlDialog } from "../../src/screens/game/HostControlDialog";

const hostControlProps = {
  open: true,
  gameState: state,
  onClose: () => undefined,
  onShuffleAll: () => undefined,
  onSwapAttribute: () => undefined,
  onReplaceAttribute: () => undefined,
  onDeleteAttribute: () => undefined,
  onForceRevealType: () => undefined,
  onRemoveBunkerCard: () => undefined,
  onReplaceBunkerCard: () => undefined,
  onRevivePlayer: () => undefined,
  onEliminatePlayer: () => undefined,
  onEndGame: () => undefined,
} satisfies ComponentProps<typeof HostControlDialog>;

test("host controls stay out of the DOM while closed", () => {
  const html = renderToStaticMarkup(<HostControlDialog {...hostControlProps} open={false} />);
  assert.equal(html, "");
});

test("host controls expose every operation group in a modal dialog", () => {
  const html = renderToStaticMarkup(<HostControlDialog {...hostControlProps} />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /Управление игрой/);
  assert.match(html, /Карты игроков/);
  assert.match(html, /Карты бункера/);
  assert.match(html, />Игроки</);
  assert.match(html, /Опасная зона/);
  assert.match(html, /Закончить игру/);
});
```

Run: `npm run test:game-screen`

Expected: FAIL because `HostControlDialog` is missing.

- [ ] **Step 2: Define the exact dialog API**

```tsx
interface HostControlDialogProps {
  open: boolean;
  gameState: ClientGameState;
  onClose: () => void;
  onShuffleAll: (type: AttributeType | "action") => void;
  onSwapAttribute: (player1Id: string, player2Id: string, type: AttributeType | "action") => void;
  onReplaceAttribute: (playerId: string, type: AttributeType | "action") => void;
  onDeleteAttribute: (playerId: string, type: AttributeType) => void;
  onForceRevealType: (type: AttributeType) => void;
  onRemoveBunkerCard: (index: number) => void;
  onReplaceBunkerCard: (index: number) => void;
  onRevivePlayer: (playerId: string) => void;
  onEliminatePlayer: (playerId: string) => void;
  onEndGame: () => void;
}
```

- [ ] **Step 3: Move all current operations and reset state deterministically**

The component owns `action`, `attributeType`, `attributeTypes`, `player1`, `player2`, `players`, `bunkerCardIndex`, and `confirmEndGame`. Implement a single reset function:

```tsx
const resetForm = () => {
  setAction(null);
  setAttributeType("profession");
  setAttributeTypes(new Set());
  setPlayer1("");
  setPlayer2("");
  setPlayers(new Set());
  setBunkerCardIndex(null);
  setConfirmEndGame(false);
};

const close = () => {
  resetForm();
  onClose();
};
```

Reuse the existing operation semantics exactly:

- `shuffle`: one type, call once;
- `swap`: two distinct alive players and one type;
- `replace`: Cartesian product of selected players and types;
- `deleteAttr`: Cartesian product excluding `action`;
- `forceReveal`: one non-action type;
- `removeBunker` and `replaceBunker`: one revealed card index;
- `revive`: one eliminated player;
- `eliminate`: one alive player.

Use `getAdminActionReadiness()` for the Apply button. After a successful Apply, call `resetForm()` but leave the dialog open. The primary close button, backdrop click, and Escape call `close()`.

- [ ] **Step 4: Add explicit end-game confirmation**

The first click on `Закончить игру` sets `confirmEndGame=true` and reveals the text `Игра завершится для всех участников. Это действие нельзя отменить.`. Only a second button labeled `Подтвердить завершение` calls `onEndGame()` and then `close()`.

- [ ] **Step 5: Run tests**

Run: `npm run test:game-screen`

Expected: 11 tests pass, 0 fail.

- [ ] **Step 6: Review without committing**

Run: `git diff --check -- client/src/screens/game/HostControlDialog.tsx client/tests/game-screen/GameScreen.test.tsx`

Expected: no output. Do not stage, commit, or push.

---

### Task 6: Recompose `GameScreen` around the new sections

**Files:**

- Modify: `client/src/screens/GameScreen.tsx`

**Interfaces:**

- Consumes: every component and helper from Tasks 1–5 plus unchanged `GameContext` actions.
- Produces: the only screen used for `CATASTROPHE_REVEAL`, `BUNKER_EXPLORE`, `ROUND_REVEAL`, `ROUND_DISCUSSION`, and `ROUND_RESULT`.

- [ ] **Step 1: Replace duplicated desktop/mobile player markup with one data source**

Import the new components and add:

```tsx
const [activeMobileTab, setActiveMobileTab] = useState<MobileGameTab>("players");
const [scenarioExpanded, setScenarioExpanded] = useState(false);
const [hostControlsOpen, setHostControlsOpen] = useState(false);

const view = buildGameScreenViewModel({ gameState, playerId, isSpectator, myCharacter });
```

Remove the separate `.desktop-only` and `.mobile-only` loops. Instantiate one `PlayerBoard` value and one `CharacterDossier` value, then pass the same values to desktop layout and mobile tab panels. `PlayerBoard` receives only `gameState.players` and never `myCharacter`.

- [ ] **Step 2: Add a visible character-loading state**

Keep `if (!gameState) return null`. Replace `if (!isSpectator && !myCharacter) return null` with:

```tsx
if (!isSpectator && !myCharacter) {
  return (
    <main className="screen command-game-screen gs-loading-state" aria-live="polite">
      <div className="gs-loading-card">
        <span className="gs-loading-indicator" aria-hidden="true" />
        <h1>Готовим вашего персонажа</h1>
        <p>Карты появятся сразу после получения данных от сервера.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Compose the desktop and mobile layouts**

The root is:

```tsx
<main className={`screen command-game-screen ${view.hasBottomAction ? "has-game-actions" : ""}`}>
```

Render in order:

1. `GameStatusHeader`;
2. spectator status `Режим наблюдателя`, when applicable;
3. `.gs-desktop-layout`, containing `ScenarioSummary` with `idPrefix="gs-scenario-desktop"` and `.gs-workspace` with `PlayerBoard` plus sticky `CharacterDossier`;
4. `MobileGameTabs` with player board, dossier, and `ScenarioSummary idPrefix="gs-scenario-mobile" alwaysExpanded`;
5. fixed action bar;
6. `HostControlDialog`;
7. existing attribute picker, expanded player, action-card confirmation, and error toast.

Do not render `CharacterDossier` or the `character` mobile tab for spectators.

- [ ] **Step 4: Connect host pause lifecycle**

Use stable handlers so the pending-admin effect has a deterministic dependency list:

```tsx
const openHostControls = useCallback(() => {
  if (hostControlsOpen) return;
  setHostControlsOpen(true);
  adminPause();
}, [adminPause, hostControlsOpen]);

const closeHostControls = useCallback(() => {
  if (!hostControlsOpen) return;
  setHostControlsOpen(false);
  adminUnpause();
}, [adminUnpause, hostControlsOpen]);
```

Update the existing `pendingAdminOpen` effect to call `openHostControls()` only for the host. Include every referenced value in its dependency array. Do not unpause while the dialog remains open.

- [ ] **Step 5: Preserve reveal behavior and correct phase copy**

Keep the first-round `revealAttribute(0)` behavior. Keep the rule `unrevealedIndices.length > 1`. Keep the confirmation before `revealActionCard()`. Drive button visibility from `view.canReveal` and `view.canRevealAction`; drive header copy from `view.phaseDescription` so an absent CTA is never paired with an instruction to click it.

- [ ] **Step 6: Upgrade existing modals semantically**

For the attribute picker, expanded player, and action-card confirmation:

- add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`;
- assign a stable `id` to each heading;
- keep backdrop click close behavior;
- add an effect that closes the currently open local modal on Escape;
- retain the existing close buttons and callback behavior.

- [ ] **Step 7: Run tests and TypeScript build**

Run: `npm run test:game-screen`

Expected: 11 tests pass, 0 fail.

Run: `npm -w client run build`

Expected: TypeScript and Vite build complete successfully. Visual styling is incomplete until Task 7, but markup must compile.

- [ ] **Step 8: Review without committing**

Run: `git diff --check -- client/src/screens/GameScreen.tsx`

Expected: no output. Do not stage, commit, or push.

---

### Task 7: Add the scoped responsive visual system

**Files:**

- Create: `client/src/styles/game-screen.css`
- Modify: `client/src/screens/GameScreen.tsx`

**Interfaces:**

- Consumes: all `.gs-*` class names from Tasks 2–6.
- Produces: isolated desktop/tablet/mobile layouts without altering generic `.players-list`, `.player-card`, `.sticky-top-bar`, or `VoteScreen` selectors.

- [ ] **Step 1: Import the stylesheet from `GameScreen.tsx`**

Add:

```ts
import "../styles/game-screen.css";
```

Do not import it from `main.tsx` or `App.tsx`.

- [ ] **Step 2: Define scoped tokens and desktop geometry**

Start the stylesheet with:

```css
.command-game-screen {
  --gs-surface: rgba(255, 255, 255, 0.055);
  --gs-surface-strong: rgba(255, 255, 255, 0.085);
  --gs-border: rgba(255, 255, 255, 0.11);
  --gs-accent-soft: rgba(139, 92, 246, 0.16);
  width: min(100%, 1200px);
  min-height: 100dvh;
  margin: 0 auto;
  padding: 0 20px 32px;
  gap: 16px;
}

.command-game-screen .gs-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.85fr);
  gap: 18px;
  align-items: start;
}

.command-game-screen .gs-dossier-column {
  position: sticky;
  top: 132px;
  min-width: 0;
}

.command-game-screen .gs-mobile-layout {
  display: none;
}
```

Use scoped selectors for every new element. Do not redefine the existing global `.player-card`, `.attributes-grid`, `.sticky-bottom-bar`, or `.admin-panel` classes.

- [ ] **Step 3: Style information hierarchy and readable cards**

Implement these visual rules:

- header: translucent solid surface, compact grid, no infinite pulse;
- phase title: strongest text in header; instruction uses secondary text with sufficient contrast;
- round steps: current, complete, and future states with both number and shape;
- scenario summary: one bounded row with a 44px toggle target;
- player cards: neutral border by default, warning border plus `Сейчас ходит` text for current turn;
- eliminated/disconnected cards: retain readable text while reducing emphasis no lower than `opacity: 0.7`;
- dossier cards: `opacity: 1` in public and private states; visibility pill explains the difference;
- action card: uses the action attribute color but does not imply public reveal;
- buttons and long text: `min-width: 0`, `overflow-wrap: anywhere`, and wrapping badges.

- [ ] **Step 4: Align the fixed action bar to the screen**

Use a viewport wrapper with an inner max-width container, or give the existing bar pseudo-container equivalent geometry. Required behavior:

```css
.command-game-screen .gs-action-bar {
  position: fixed;
  z-index: 80;
  left: 50%;
  bottom: 0;
  width: min(100%, 1200px);
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px 20px max(12px, env(safe-area-inset-bottom));
  background: rgba(15, 11, 30, 0.96);
  border-top: 1px solid var(--gs-border);
  backdrop-filter: blur(18px);
}

.command-game-screen.has-game-actions {
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
}

.command-game-screen.has-game-actions .error-toast {
  bottom: calc(96px + env(safe-area-inset-bottom));
}
```

When only one action exists, let it span all columns.

- [ ] **Step 5: Implement tablet and mobile breakpoints**

Tablet:

```css
@media (min-width: 769px) and (max-width: 1023px) {
  .command-game-screen .gs-workspace {
    grid-template-columns: 1fr;
  }

  .command-game-screen .gs-dossier-column {
    position: static;
    order: -1;
  }

  .command-game-screen .gs-player-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

Mobile:

```css
@media (max-width: 768px) {
  .command-game-screen {
    padding-inline: 12px;
  }

  .command-game-screen .gs-desktop-layout,
  .command-game-screen > .gs-scenario-desktop {
    display: none;
  }

  .command-game-screen .gs-mobile-layout {
    display: block;
  }

  .command-game-screen .gs-player-list {
    grid-template-columns: 1fr;
  }

  .command-game-screen .gs-action-bar {
    grid-template-columns: 1fr;
    padding-inline: 12px;
  }

  .command-game-screen.has-game-actions {
    padding-bottom: calc(154px + env(safe-area-inset-bottom));
  }

  .command-game-screen.has-game-actions .error-toast {
    bottom: calc(154px + env(safe-area-inset-bottom));
  }

  .command-game-screen .gs-host-dialog {
    align-items: end;
  }

  .command-game-screen .gs-host-dialog-panel {
    width: 100%;
    max-height: min(86dvh, 720px);
    border-radius: 18px 18px 0 0;
  }
}
```

At `max-width: 480px`, allow header actions and metadata to stack; do not hide the phase, timer, active round, or main action.

- [ ] **Step 6: Add modal sizing, focus, and reduced-motion rules**

All new dialog panels use `max-height: min(86dvh, 760px)` and `overflow-y: auto`. Every button and tab has a visible `:focus-visible` ring. Add:

```css
@media (prefers-reduced-motion: reduce) {
  .command-game-screen *,
  .command-game-screen *::before,
  .command-game-screen *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 7: Run automated checks**

Run: `npm run test:game-screen`

Expected: 11 tests pass, 0 fail.

Run: `npm -w client run build`

Expected: successful TypeScript and Vite build.

Run: `npx prettier --check client/src/screens/GameScreen.tsx client/src/screens/game client/src/styles/game-screen.css package.json`

Expected: all listed files use Prettier formatting.

- [ ] **Step 8: Review without committing**

Run: `git diff --check -- client/src/screens/GameScreen.tsx client/src/screens/game client/src/styles/game-screen.css package.json`

Expected: no output. Do not stage, commit, or push.

---

### Task 8: Perform responsive and regression verification

**Files:**

- Verify: `client/src/screens/GameScreen.tsx`
- Verify: `client/src/screens/game/*.tsx`
- Verify: `client/src/styles/game-screen.css`
- Verify unchanged behavior: `client/src/screens/VoteScreen.tsx`

**Interfaces:**

- Consumes: the completed GameScreen implementation.
- Produces: verified working tree ready for the user's own review and Git operations.

- [ ] **Step 1: Run the full project checks**

Run:

```bash
npm run test:game-screen
npm -w client run build
npm run format:check
```

Expected: all game-screen tests pass, the client build succeeds, and Prettier reports no formatting differences. If `format:check` reports only pre-existing unrelated files, record those exact paths and run Prettier check again on every changed file.

- [ ] **Step 2: Start the existing app and create a representative room**

Run: `npm run dev`

In the browser:

1. create a room as host;
2. add at least three bots;
3. start the game;
4. reach `ROUND_REVEAL`;
5. keep DevTools device emulation available.

Expected: no runtime error, blank screen, or socket regression.

- [ ] **Step 3: Verify the required widths**

Inspect at exactly `320`, `390`, `768`, `1024`, and `1440px` widths. At each width verify:

- no horizontal scrollbar;
- phase, timer, and active round remain visible;
- main CTA does not cover the final content row;
- names and long card values wrap inside their cards;
- dialogs remain within `100dvh` and their actions are reachable.

- [ ] **Step 4: Verify player and phase states**

Check:

- another player's turn;
- the host's own turn with characteristic and action-card buttons;
- discussion with `Пропустить обсуждение`;
- newly revealed bunker card;
- eliminated and disconnected player presentation;
- expanded player dialog;
- character-loading presentation by temporarily throttling the character response or reloading during reconnect.

Expected: every state has readable copy and no hidden required action.

- [ ] **Step 5: Verify mobile tabs and privacy**

At `390px`:

- default tab is `Игроки`;
- `Персонаж` shows all private values with `Видно только вам` or `Раскрыто всем`;
- `Игроки` never shows unrevealed private values;
- `Ситуация` shows catastrophe, bunker cards, capacity, and threat;
- keyboard focus moves through all three tabs and Enter/Space selects them.

- [ ] **Step 6: Verify host controls and pause lifecycle**

Open `Управление` and verify all nine operations remain available. Confirm that non-host players see the existing pause overlay while the dialog is open and resume when it closes. Cancel a multi-select operation, reopen it, and verify previous selections were cleared. Confirm that `Закончить игру` requires the second explicit confirmation.

- [ ] **Step 7: Verify `VoteScreen` regression boundary**

Reach voting and compare it with the pre-change layout. Confirm that no `.gs-*` selector changes `VoteScreen`, its player candidates, timer, admin controls, or bottom spacing.

- [ ] **Step 8: Final working-tree review without Git mutations**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only the approved GameScreen implementation, its tests, styles, plan, and the user's pre-existing `CLAUDE.md`/`AGENTS.md` changes appear. Do not stage, commit, or push.
