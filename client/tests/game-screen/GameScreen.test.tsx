import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import type { Character, PlayerInfo } from "../../../shared/types";
import type { ClientGameState } from "../../src/context/GameContext";
import { AccessibleModal } from "../../src/screens/game/AccessibleModal";
import { CharacterLoadingState } from "../../src/screens/game/CharacterLoadingState";
import { CharacterDossier } from "../../src/screens/game/CharacterDossier";
import { GameStatusHeader } from "../../src/screens/game/GameStatusHeader";
import { GameRoomHeader } from "../../src/screens/game/GameRoomHeader";
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
  kicked: false,
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
  startedPlayerCount: 2,
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
  pauseKind: "none",
  disconnectedPlayerIds: [],
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
  startedPlayerCount: 0,
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
  pauseKind: "none",
  disconnectedPlayerIds: [],
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
  assert.equal("votingInfo" in view, false);
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
  const statusState: ClientGameState = {
    ...state,
    players: [me, { ...other, alive: false }],
    threatCard: { title: "Радиационная буря", description: "Фильтры работают на пределе" },
  };
  const html = renderToStaticMarkup(
    <GameStatusHeader
      gameState={statusState}
      phaseLabel="Раскрытие карт"
      phaseDescription="Сейчас ходит Михаил"
      isMyTurn={false}
    />,
  );
  assert.match(html, /aria-label="Состояние игры"/);
  assert.match(html, /class="gs-info-strip/);
  assert.match(html, /<section class="gs-info-scenario/);
  assert.doesNotMatch(html, /<button[^>]*class="gs-info-scenario/);
  assert.doesNotMatch(html, /aria-expanded/);
  assert.doesNotMatch(html, /gs-codex-scenario-chevron/);
  assert.match(html, /class="gs-codex-scenario-icon/);
  assert.match(html, /Сценарий катастрофы/);
  assert.match(html, /Началось вторжение/);
  assert.match(html, /class="gs-info-metric gs-info-timer/);
  assert.match(html, /class="gs-info-timer-empty">—</);
  assert.match(html, /class="gs-info-metric gs-info-capacity/);
  assert.match(html, /class="gs-info-capacity-value">2<span>\/1<\/span>/);
  assert.match(html, /class="gs-info-metric gs-info-round/);
  assert.match(html, /class="gs-info-progress/);
  assert.match(html, /02 \/ 05/);
  assert.equal((html.match(/gs-info-round-segment/g) ?? []).length, 5);
  assert.equal((html.match(/gs-info-round-segment is-filled/g) ?? []).length, 2);
  assert.doesNotMatch(html, /gs-scenario-summary/);
  assert.match(html, /Раунд 2 из 5/);
  assert.match(html, /Раскрытие карт/);
  assert.match(html, /Инопланетяне/);
  assert.match(html, /class="gs-desktop-situation-details/);
  assert.match(html, /Генератор/);
  assert.doesNotMatch(html, /Мест в бункере:/);
  assert.doesNotMatch(html, /gs-bunker-capacity/);
  assert.match(html, /Радиационная буря/);
  assert.match(html, /Фильтры работают на пределе/);
  assert.equal((html.match(/Началось вторжение/g) ?? []).length, 1);
  assert.doesNotMatch(html, /gs-catastrophe-details/);
  assert.match(html, /class="gs-bunker-card gs-bunker-threat-card/);
});

test("game screen keeps the desktop scenario static and omits voting status", () => {
  const source = readFileSync(new URL("../../src/screens/GameScreen.tsx", import.meta.url), "utf8");
  const voteSource = readFileSync(
    new URL("../../src/screens/VoteScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /scenarioExpanded/);
  assert.doesNotMatch(source, /onToggleScenario/);
  assert.doesNotMatch(source, /votingInfo/);
  assert.doesNotMatch(voteSource, /Голосование \{gameState\.currentVotingInRound/);
  assert.doesNotMatch(source, /gs-scenario-desktop/);
});

test("room header exposes existing room actions", () => {
  const html = renderToStaticMarkup(
    <GameRoomHeader
      roomCode="AX-204"
      connected={true}
      canManageGame={true}
      canSkipDiscussion={true}
      onOpenHostControls={() => undefined}
      onSkipDiscussion={() => undefined}
      onLeaveRoom={() => undefined}
    />,
  );

  assert.match(html, /Бункер/);
  assert.doesNotMatch(html, /Протокол выживания/);
  assert.match(html, /AX-204/);
  assert.match(html, /Связь установлена/);
  assert.match(html, /aria-label="Управление игрой"/);
  assert.match(html, />Админ-панель</);
  assert.match(html, />Пропустить обсуждение</);
  assert.match(html, /aria-label="Выйти из комнаты"/);
});

test("host actions stay visible when discussion cannot be skipped", () => {
  const html = renderToStaticMarkup(
    <GameRoomHeader
      roomCode="AX-204"
      connected={true}
      canManageGame={true}
      canSkipDiscussion={false}
      onOpenHostControls={() => undefined}
      onSkipDiscussion={() => undefined}
      onLeaveRoom={() => undefined}
    />,
  );

  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*>[\s\S]*?Пропустить обсуждение[\s\S]*?<\/button>/,
  );
  assert.match(html, />Админ-панель</);
});

test("room header hides management from non-host players", () => {
  const html = renderToStaticMarkup(
    <GameRoomHeader
      roomCode="AX-204"
      connected={false}
      canManageGame={false}
      canSkipDiscussion={false}
      onOpenHostControls={() => undefined}
      onSkipDiscussion={() => undefined}
      onLeaveRoom={() => undefined}
    />,
  );

  assert.doesNotMatch(html, /aria-label="Управление игрой"/);
  assert.match(html, /Нет соединения/);
});

test("game screen wires existing room actions into the room header", () => {
  const source = readFileSync(new URL("../../src/screens/GameScreen.tsx", import.meta.url), "utf8");

  assert.match(source, /<GameRoomHeader/);
  assert.match(source, /roomCode=\{roomCode\}/);
  assert.match(source, /onOpenHostControls=\{openHostControls\}/);
  assert.match(source, /onLeaveRoom=\{leaveRoom\}/);
});

test("vote screen keeps host controls in the common render path", () => {
  const source = readFileSync(new URL("../../src/screens/VoteScreen.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /if \(!canVote\) \{\s*return \(/);
  assert.doesNotMatch(source, /if \(voted\) \{\s*return \(/);
  assert.match(source, /<HostControlDialog/);
  assert.match(source, /<GameRoomHeader/);
  assert.match(source, /const adminPauseActiveRef = useRef\(false\);/);
  assert.match(source, /const closeAdminPanel = useCallback/);
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*return \(\) => \{[^}]*adminPauseActiveRef\.current = false;\s*adminUnpause\(\);/s,
  );
  assert.match(source, /if \(!confirmTarget \|\| voteLocked\) return;/);
  assert.match(source, /if \(!castVote\(confirmTarget\)\) return;/);
});

test("scenario summary keeps its description visible while bunker details are collapsed", () => {
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
  assert.match(html, /Началось вторжение/);
  assert.doesNotMatch(html, /gs-scenario-details/);
});

test("mobile situation shows the warning icon and complete shared details", () => {
  const richState: ClientGameState = {
    ...state,
    threatCard: { title: "Радиационная буря", description: "Фильтры работают на пределе" },
  };
  const html = renderToStaticMarkup(
    <ScenarioSummary
      idPrefix="mobile-situation"
      gameState={richState}
      expanded
      alwaysExpanded
      onToggle={() => undefined}
    />,
  );
  const scenarioSource = readFileSync(
    new URL("../../src/screens/game/ScenarioSummary.tsx", import.meta.url),
    "utf8",
  );
  const statusSource = readFileSync(
    new URL("../../src/screens/game/GameStatusHeader.tsx", import.meta.url),
    "utf8",
  );

  assert.match(html, /class="gs-scenario-alert-icon/);
  assert.match(html, /class="gs-scenario-description">Началось вторжение/);
  assert.equal((html.match(/Началось вторжение/g) ?? []).length, 1);
  assert.doesNotMatch(html, /gs-catastrophe-details/);
  assert.match(html, /Началось вторжение/);
  assert.match(html, /Генератор/);
  assert.match(html, /Мест: 2/);
  assert.doesNotMatch(html, /Мест в бункере:/);
  assert.doesNotMatch(html, /gs-bunker-capacity/);
  assert.match(html, /Радиационная буря/);
  assert.match(html, /Фильтры работают на пределе/);
  assert.match(html, /class="gs-bunker-card gs-bunker-threat-card/);
  assert.match(scenarioSource, /export function ScenarioDetails/);
  assert.match(scenarioSource, /<ScenarioDetails/);
  assert.match(statusSource, /import \{ ScenarioDetails \}/);
  assert.match(statusSource, /<ScenarioDetails/);
});

test("bunker information heading includes a compact decorative icon", () => {
  const html = renderToStaticMarkup(
    <ScenarioSummary
      idPrefix="bunker-icon"
      gameState={state}
      expanded
      alwaysExpanded
      onToggle={() => undefined}
    />,
  );
  const css = readFileSync(new URL("../../src/styles/game-screen.css", import.meta.url), "utf8");

  assert.match(html, /<h3 class="gs-bunker-heading"/);
  assert.match(html, /class="gs-bunker-heading-icon"[^>]*aria-hidden="true"/);
  assert.match(
    css,
    /\.command-game-screen \.gs-bunker-heading \{[^}]*display: flex;[^}]*align-items: center;[^}]*gap: 6px;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-bunker-heading-icon \{[^}]*width: 13px;[^}]*height: 13px;[^}]*color: var\(--info\);/s,
  );
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
  kicked: false,
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

test("player cards illustrate every public characteristic and mark eliminated players", () => {
  const publicPlayer: PlayerInfo = {
    ...player,
    alive: false,
    revealedAttributes: [
      { type: "profession", label: "Профессия", value: "Врач" },
      { type: "bio", label: "Биология", value: "Женщина, 32 года" },
    ],
    actionCard: privateCharacter.actionCard,
    actionCardRevealed: true,
  };
  const html = renderToStaticMarkup(
    <PlayerBoard
      players={[publicPlayer]}
      playerId={null}
      currentTurnPlayerId={null}
      lastEliminatedPlayerId="player-1"
      onSelectPlayer={() => undefined}
    />,
  );

  assert.match(html, /class="gs-player-card is-eliminated/);
  assert.match(html, />Изгнан</);
  assert.equal((html.match(/class="gs-public-attribute-icon"/g) ?? []).length, 3);
  assert.equal((html.match(/class="gs-public-attribute-copy"/g) ?? []).length, 3);
});

test("player characteristic names reuse the exact card palette", () => {
  const css = readFileSync(new URL("../../src/styles/game-screen.css", import.meta.url), "utf8");
  const semanticTypes = ["profession", "bio", "health", "hobby", "baggage", "fact", "action"];

  for (const type of semanticTypes) {
    assert.match(
      css,
      new RegExp(
        `\\.command-game-screen \\[data-attr-type="${type}"\\] \\{[^}]*--gs-attribute-color: var\\(--card-${type}-color\\);`,
        "s",
      ),
    );
  }

  assert.match(
    css,
    /\.command-game-screen \.gs-public-attribute-copy > span \{[^}]*color: var\(--gs-attribute-color\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-dossier-card-label \{[^}]*color: var\(--gs-attribute-color\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-dossier-card\[data-attr-type="action"\] \{[^}]*rgba\(192, 132, 252, 0\.07\)[^}]*rgba\(192, 132, 252, 0\.28\);/s,
  );
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
  assert.match(html, /Не раскрыто/);
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

test("hybrid CSS uses the full desktop width and distinct player state accents", () => {
  const css = readFileSync(new URL("../../src/styles/game-screen.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.screen\.command-game-screen \{[^}]*--gs-page: #07100c;[^}]*--gs-gold: #efbd58;[^}]*--gs-green: #76c69e;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-room-action \{[^}]*min-width: 44px;[^}]*min-height: 44px;/s,
  );
  assert.match(css, /\.screen\.command-game-screen \{[^}]*width: 100%;[^}]*max-width: none;/s);
  assert.match(
    css,
    /\.command-game-screen \.gs-player-list \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(280px, 100%\), 1fr\)\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-workspace \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(300px, 320px\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-player-card\.is-me \{[^}]*border-color: rgba\(239, 189, 88,[^}]*box-shadow: inset 3px 0 0 var\(--gs-gold\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-player-card\.is-current-turn \{[^}]*border-color: var\(--gs-green\);[^}]*box-shadow:/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-player-card\.is-eliminated \{[^}]*background: #080d0a;[^}]*border-color: rgba\(217, 120, 108, 0\.28\);[^}]*box-shadow: inset 3px 0 0 rgba\(217, 120, 108, 0\.58\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-player-card\.is-disconnected:not\(\.is-eliminated\) \{[^}]*opacity: 0\.72;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-player-card\.is-me\.is-eliminated \{[^}]*border-color: rgba\(239, 189, 88, 0\.38\);[^}]*box-shadow:[^}]*inset 3px 0 0 var\(--gs-gold\),[^}]*inset 6px 0 0 rgba\(217, 120, 108, 0\.58\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-public-attributes \{[^}]*display: grid;[^}]*grid-template-columns: 1fr;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-public-attribute \{[^}]*grid-template-columns: 30px minmax\(0, 1fr\);/s,
  );
});

test("mobile info and actions stay compact while desktop host controls use two columns", () => {
  const css = readFileSync(new URL("../../src/styles/game-screen.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.command-game-screen \.gs-host-dialog-panel \{[^}]*width: min\(100%, 1040px\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-host-control-groups \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-info-scenario,[\s\S]*\.command-game-screen \.gs-info-capacity,[\s\S]*\.command-game-screen \.gs-info-progress \{[^}]*display: none;/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-action-bar \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-action-bar \.btn \{[^}]*height: 56px;/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-public-attribute-visual \{[^}]*display: none;/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-public-attribute \{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-public-attributes \{[^}]*grid-template-columns: 1fr;/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-public-attribute-copy \{[^}]*flex-direction: row;[^}]*flex-wrap: wrap;/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-public-attribute \{[^}]*padding: 2px 0;[^}]*background: transparent;[^}]*border: 0;/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.screen\.command-game-screen\.has-game-actions \{[^}]*padding-bottom: calc\(82px \+ env\(safe-area-inset-bottom\)\);/,
  );
});

test("vote admin uses the shared modal above responsive content", () => {
  const globalCss = readFileSync(new URL("../../src/styles/global.css", import.meta.url), "utf8");
  const gameCss = readFileSync(
    new URL("../../src/styles/game-screen.css", import.meta.url),
    "utf8",
  );

  assert.match(gameCss, /\.command-game-screen \.gs-host-dialog \{[^}]*z-index: 120;/s);
  assert.match(globalCss, /\.modal-overlay \{[^}]*z-index: 100;/s);
  assert.doesNotMatch(globalCss, /\.vote-admin-panel/);
});

test("desktop status strip uses the Codex reference geometry", () => {
  const css = readFileSync(new URL("../../src/styles/game-screen.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.command-game-screen \.gs-info-strip \{[^}]*grid-template-columns: minmax\(360px, 1\.7fr\) minmax\(650px, 2\.3fr\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-info-scenario \{[^}]*grid-template-columns: 44px minmax\(0, 1fr\);[^}]*gap: 12px;[^}]*padding: 12px;/s,
  );
  assert.doesNotMatch(css, /\.command-game-screen \.gs-info-scenario \{[^}]*cursor: pointer;/s);
  assert.match(
    css,
    /\.command-game-screen \.gs-scenario-alert-icon \{[^}]*width: 34px;[^}]*height: 34px;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-desktop-situation-details \{[^}]*grid-column: 1 \/ -1;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-desktop-situation-details \.gs-scenario-details \{[^}]*grid-template-columns: 1fr;[^}]*padding: 4px;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-bunker-details \{[^}]*background: transparent;[^}]*border: 0;[^}]*border-radius: 0;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-bunker-cards \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(190px, 100%\), 1fr\)\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-bunker-threat-card \{[^}]*border-color: rgba\(239, 189, 88, 0\.32\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-info-metrics \{[^}]*grid-template-columns:[^;]*repeat\(3, minmax\(132px, 0\.9fr\)\)[^;]*minmax\(230px, 1\.55fr\)[^;]*;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-info-round-segment \{[^}]*height: 4px;[^}]*flex: 1;[^}]*border-radius: 999px;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-info-round-segment\.is-filled \{[^}]*background: var\(--gs-gold\);/s,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-info-scenario,[\s\S]*\.command-game-screen \.gs-info-capacity,[\s\S]*\.command-game-screen \.gs-info-progress \{[^}]*display: none;/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-desktop-situation-details \{[^}]*display: none;/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-bunker-cards \{[^}]*grid-template-columns: 1fr;/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-scenario-summary \{[^}]*align-items: start;/,
  );
});

test("game-screen modals and action cards do not fall back to the purple legacy theme", () => {
  const css = readFileSync(new URL("../../src/styles/game-screen.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /#8b5cf6|#a78bfa|#c4b5fd|rgba\(139, 92, 246/);

  const semanticPurpleBlocks = [
    ...css.matchAll(/([^{}]+)\{([^{}]*(?:#c084fc|rgba\(192, 132, 252)[^{}]*)\}/g),
  ];
  assert.equal(semanticPurpleBlocks.length, 2);
  for (const [, selector] of semanticPurpleBlocks) {
    assert.match(selector, /\[data-attr-type="action"\]/);
  }

  assert.match(
    css,
    /\.command-game-screen > \.modal-overlay > \.modal \{[^}]*color: var\(--gs-text\);[^}]*background: var\(--gs-surface\);[^}]*border-color: rgba\(178, 199, 185, 0\.24\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.expanded-player-modal \.me-badge \{[^}]*background: var\(--gs-gold\);/s,
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

test("reconnect host controls expose claim decisions, permanent kick, and host transfer", async () => {
  const { ReconnectHostControls } = await import("../../src/screens/game/ReconnectHostControls");
  const connectedPlayer: PlayerInfo = {
    ...other,
    id: "connected-player",
    name: "Михаил",
    connected: true,
  };
  const missingPlayer: PlayerInfo = {
    ...other,
    id: "missing-player",
    name: "Ольга",
    connected: false,
  };
  const calls: string[] = [];
  const renderer = create(
    <ReconnectHostControls
      players={[me, connectedPlayer, missingPlayer]}
      claims={[
        {
          requestId: "claim-1",
          playerId: missingPlayer.id,
          playerName: missingPlayer.name,
          claimantName: "Новая Ольга",
        },
      ]}
      onResolveClaim={(requestId, approved) => calls.push(`claim:${requestId}:${approved}`)}
      onKickPlayer={(playerId) => calls.push(`kick:${playerId}`)}
      onTransferHost={(playerId) => calls.push(`transfer:${playerId}`)}
    />,
  );

  const html = renderToStaticMarkup(
    <ReconnectHostControls
      players={[me, connectedPlayer, missingPlayer]}
      claims={[
        {
          requestId: "claim-1",
          playerId: missingPlayer.id,
          playerName: missingPlayer.name,
          claimantName: "Новая Ольга",
        },
      ]}
      onResolveClaim={() => undefined}
      onKickPlayer={() => undefined}
      onTransferHost={() => undefined}
    />,
  );
  assert.match(html, /Новая Ольга/);
  assert.match(html, /Претендует на место «Ольга»/);
  assert.match(html, /Одобрить/);
  assert.match(html, /Отклонить/);
  assert.match(html, /Удалить навсегда/);
  assert.match(html, /Передать права хоста/);

  const clickByLabel = async (label: string) => {
    const button = renderer.root
      .findAllByType("button")
      .find((candidate) => candidate.props["aria-label"] === label);
    assert.ok(button, `Expected ${label}`);
    await act(async () => button.props.onClick());
  };
  await clickByLabel("Одобрить заявку Новая Ольга");
  await clickByLabel("Отклонить заявку Новая Ольга");
  await clickByLabel("Удалить игрока Ольга");
  assert.deepEqual(calls, ["claim:claim-1:true", "claim:claim-1:false"]);
  await clickByLabel("Подтвердить удаление Ольга");
  await clickByLabel("Передать права игроку Михаил");
  assert.deepEqual(calls, [
    "claim:claim-1:true",
    "claim:claim-1:false",
    "kick:missing-player",
    "transfer:connected-player",
  ]);
});

test("active-game leave requires confirmation before preserving the seat", async () => {
  let leaveCalls = 0;
  const renderer = create(
    <GameRoomHeader
      roomCode="AX-204"
      connected
      canManageGame={false}
      canSkipDiscussion={false}
      confirmActiveLeave
      onOpenHostControls={() => undefined}
      onSkipDiscussion={() => undefined}
      onLeaveRoom={() => {
        leaveCalls++;
      }}
    />,
  );
  const leaveButton = renderer.root.findByProps({ "aria-label": "Выйти из комнаты" });
  await act(async () => leaveButton.props.onClick());
  assert.equal(leaveCalls, 0);
  assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 1);
  const modalButtons = renderer.root.findByProps({ role: "dialog" }).findAllByType("button");
  assert.match(modalButtons[0]?.children.join("") ?? "", /Остаться/);
  assert.match(
    renderToStaticMarkup(
      <GameRoomHeader
        roomCode="AX-204"
        connected
        canManageGame={false}
        canSkipDiscussion={false}
        confirmActiveLeave
        onOpenHostControls={() => undefined}
        onSkipDiscussion={() => undefined}
        onLeaveRoom={() => undefined}
      />,
    ),
    /aria-label="Выйти из комнаты"/,
  );
  const confirmButton = renderer.root
    .findAllByType("button")
    .find((candidate) => candidate.children.join("").includes("Покинуть и сохранить место"));
  assert.ok(confirmButton);
  await act(async () => confirmButton.props.onClick());
  assert.equal(leaveCalls, 1);
});

test("kicked player cards use the permanent administrator label", () => {
  const gameSource = readFileSync(
    new URL("../../src/screens/GameScreen.tsx", import.meta.url),
    "utf8",
  );
  const html = renderToStaticMarkup(
    <PlayerBoard
      players={[{ ...player, connected: false, alive: false, kicked: true }]}
      playerId={null}
      currentTurnPlayerId={null}
      lastEliminatedPlayerId={null}
      onSelectPlayer={() => undefined}
    />,
  );
  assert.match(html, /is-kicked/);
  assert.match(html, /Удалён администратором/);
  assert.doesNotMatch(html, />Изгнан</);
  assert.doesNotMatch(html, />Отключён</);
  assert.match(gameSource, /player\.kicked \? "УДАЛЁН АДМИНИСТРАТОРОМ" : "ИЗГНАН"/);
});

test("reconnect moderation is reused in game, vote, and compact lobby host surfaces", () => {
  const gameSource = readFileSync(
    new URL("../../src/screens/GameScreen.tsx", import.meta.url),
    "utf8",
  );
  const voteSource = readFileSync(
    new URL("../../src/screens/VoteScreen.tsx", import.meta.url),
    "utf8",
  );
  const dialogSource = readFileSync(
    new URL("../../src/screens/game/HostControlDialog.tsx", import.meta.url),
    "utf8",
  );
  const lobbySource = readFileSync(
    new URL("../../src/screens/LobbyScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dialogSource, /<ReconnectHostControls/);
  assert.match(lobbySource, /<ReconnectHostControls[\s\S]*compact/);
  assert.match(voteSource, /<HostControlDialog/);
  assert.match(voteSource, /<GameRoomHeader/);
  assert.match(voteSource, /confirmActiveLeave/);
  assert.match(voteSource, /onEndGame=/);
  assert.match(gameSource, /hostSeatClaims/);
  assert.match(gameSource, /if \(!isCurrentHost\)[\s\S]*setHostControlsOpen\(false\)/);
  assert.match(voteSource, /if \(!isCurrentHost\)[\s\S]*setAdminOpen\(false\)/);
  assert.match(gameSource, /confirmActiveLeave=\{!isSpectator\}/);
  assert.match(gameSource, /<ReconnectHostBanner/);
  assert.match(voteSource, /<ReconnectHostBanner/);
});

test("voting recovery remains server-authoritative and blocks pre-membership ballots", () => {
  const voteSource = readFileSync(
    new URL("../../src/screens/VoteScreen.tsx", import.meta.url),
    "utf8",
  );
  const sharedSource = readFileSync(new URL("../../../shared/types.ts", import.meta.url), "utf8");
  const engineSource = readFileSync(
    new URL("../../../server/src/gameEngine.ts", import.meta.url),
    "utf8",
  );
  const socketSource = readFileSync(
    new URL("../../../server/src/socketHandlers.ts", import.meta.url),
    "utf8",
  );
  const contextSource = readFileSync(
    new URL("../../src/context/GameContext.tsx", import.meta.url),
    "utf8",
  );

  assert.match(sharedSource, /"game:voterStatus"/);
  assert.doesNotMatch(engineSource, /hasVoted: p\.hasVoted/);
  assert.match(socketSource, /emitPrivateVoterStatus/);
  assert.match(contextSource, /myHasVoted/);
  assert.match(voteSource, /const voted = myHasVoted/);
  assert.match(voteSource, /reconnectState !== "connected"/);
  assert.match(voteSource, /voteSubmitting/);
  assert.match(voteSource, /if \(!castVote\(confirmTarget\)\) return/);
});

test("accessible modal inerts every outside ancestor layer", () => {
  const source = readFileSync(
    new URL("../../src/screens/game/AccessibleModal.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /while \(currentLayer && currentLayer !== document\.body\)/);
  assert.match(source, /currentLayer = parent/);
});

test("host recovery banner names missing players and opens moderation", async () => {
  const { ReconnectHostBanner } = await import("../../src/screens/game/ReconnectHostControls");
  let openCalls = 0;
  const players = [me, { ...other, connected: false, name: "Ольга" }];
  const renderer = create(
    <ReconnectHostBanner
      players={players}
      claimsCount={2}
      onOpen={() => {
        openCalls++;
      }}
    />,
  );
  const html = renderToStaticMarkup(
    <ReconnectHostBanner players={players} claimsCount={2} onOpen={() => undefined} />,
  );
  assert.match(html, /Ольга/);
  assert.match(html, /2/);
  await act(async () => renderer.root.findByType("button").props.onClick());
  assert.equal(openCalls, 1);

  assert.equal(
    renderToStaticMarkup(
      <ReconnectHostBanner players={[me, other]} claimsCount={0} onOpen={() => undefined} />,
    ),
    "",
  );
});

test("final results preserve permanent administrator removal labels", () => {
  const resultsSource = readFileSync(
    new URL("../../src/screens/ResultsScreen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(resultsSource, /p\.alive && !p\.kicked/);
  assert.match(resultsSource, /!p\.alive && !p\.kicked/);
  assert.match(resultsSource, /Удалённые администратором/);
  assert.match(resultsSource, /Удалён администратором/);
});

test("reconnect controls and room actions retain 44px mobile touch targets", () => {
  const globalCss = readFileSync(new URL("../../src/styles/global.css", import.meta.url), "utf8");
  const gameCss = readFileSync(
    new URL("../../src/styles/game-screen.css", import.meta.url),
    "utf8",
  );

  assert.match(globalCss, /\.reconnect-host-action \{[^}]*min-height: 44px;/s);
  assert.match(globalCss, /\.reconnect-host-controls\.is-compact \{[^}]*padding: 12px;/s);
  assert.match(globalCss, /\.btn-admin \{[^}]*min-height: 44px;/s);
  assert.match(globalCss, /\.admin-chip \{[^}]*min-height: 44px;/s);
  assert.match(globalCss, /\.player-item \{[^}]*min-width: 0;/s);
  assert.match(
    globalCss,
    /\.player-name \{[^}]*min-width: 0;[^}]*flex-wrap: wrap;[^}]*overflow-wrap: anywhere;/s,
  );
  assert.match(
    globalCss,
    /\.result-player-name \{[^}]*min-width: 0;[^}]*flex-wrap: wrap;[^}]*overflow-wrap: anywhere;/s,
  );
  assert.match(
    globalCss,
    /@media \(max-width: 768px\)[\s\S]*\.player-item \{[^}]*flex-wrap: wrap;/,
  );
  assert.match(
    globalCss,
    /@media \(max-width: 768px\)[\s\S]*\.reconnect-host-action,[\s\S]*\.reconnect-screen \.btn \{[^}]*min-height: 44px;/,
  );
  assert.match(gameCss, /\.command-game-screen \.gs-room-host-action \{[^}]*min-height: 44px;/s);
  assert.match(
    gameCss,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-room-host-action \{[^}]*min-height: 44px;/,
  );
});
