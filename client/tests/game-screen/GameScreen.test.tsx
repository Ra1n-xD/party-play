import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Character, PlayerInfo } from "../../../shared/types";
import type { ClientGameState } from "../../src/context/GameContext";
import { AccessibleModal } from "../../src/screens/game/AccessibleModal";
import { CharacterLoadingState } from "../../src/screens/game/CharacterLoadingState";
import { CharacterDossier } from "../../src/screens/game/CharacterDossier";
import { GameStatusHeader } from "../../src/screens/game/GameStatusHeader";
import { HostControlDialog } from "../../src/screens/game/HostControlDialog";
import { getNextMobileTab, MobileGameTabs } from "../../src/screens/game/MobileGameTabs";
import { PlayerBoard } from "../../src/screens/game/PlayerBoard";
import { ScenarioSummary } from "../../src/screens/game/ScenarioSummary";
import {
  buildGameScreenViewModel,
  getAdminActionReadiness,
  isExpandedActionCardPublic,
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

const viewModelState: ClientGameState = {
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

test("character loading keeps a server error visible", () => {
  const html = renderToStaticMarkup(<CharacterLoadingState error="Сессия истекла" />);

  assert.match(html, /Готовим вашего персонажа/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Сессия истекла/);
});

test("accessible modal exposes a labelled focus target", () => {
  const html = renderToStaticMarkup(
    <AccessibleModal labelledBy="test-dialog-title" onClose={() => undefined}>
      <h2 id="test-dialog-title">Проверка</h2>
      <button type="button">Закрыть</button>
    </AccessibleModal>,
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="test-dialog-title"/);
  assert.match(html, /tabindex="-1"/);
});

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

test("marks matched attributes as public while keeping the rest available", () => {
  const view = buildGameScreenViewModel({
    gameState: viewModelState,
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
    ...viewModelState,
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
    gameState: viewModelState,
    playerId: "spectator",
    isSpectator: true,
    myCharacter: null,
  });

  assert.equal(view.me, undefined);
  assert.equal(view.canReveal, false);
  assert.equal(view.canRevealAction, false);
});

test("the owner's expanded action card stays private until it is revealed", () => {
  assert.equal(isExpandedActionCardPublic(true, false), false);
  assert.equal(isExpandedActionCardPublic(true, true), true);
  assert.equal(isExpandedActionCardPublic(false, false), true);
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

test("host chips and modal close controls keep 44px touch targets", () => {
  const css = readFileSync(new URL("../../src/styles/game-screen.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.command-game-screen \.gs-host-dialog-panel \.admin-chip \{[^}]*min-height: 44px;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.modal-close-btn \{[^}]*min-width: 44px;[^}]*min-height: 44px;/s,
  );
});

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
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1);
  assert.equal((html.match(/tabindex="-1"/g) ?? []).length, 2);
});

test("mobile tabs support arrow, Home, and End navigation", () => {
  const ids = ["players", "character", "situation"] as const;

  assert.equal(getNextMobileTab(ids, "players", "ArrowRight"), "character");
  assert.equal(getNextMobileTab(ids, "players", "ArrowLeft"), "situation");
  assert.equal(getNextMobileTab(ids, "character", "Home"), "players");
  assert.equal(getNextMobileTab(ids, "character", "End"), "situation");
});

test("mobile tabs select players when the active character tab is unavailable", () => {
  const html = renderToStaticMarkup(
    <MobileGameTabs
      activeTab="character"
      showCharacter={false}
      onChange={() => undefined}
      players={<div>Список игроков</div>}
      character={<div>Личное досье</div>}
      situation={<div>Катастрофа</div>}
    />,
  );
  assert.match(html, /id="gs-mobile-tab-players"[^>]*aria-selected="true"/);

  const playersPanel = html.match(/<div role="tabpanel" id="gs-mobile-panel-players"[^>]*>/)?.[0];
  assert.ok(playersPanel);
  assert.doesNotMatch(playersPanel, /hidden/);
});
