import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import React, { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

test("room header keeps only room-level controls and uses a bunker mark", () => {
  const headerSource = readFileSync(
    new URL("../../src/screens/game/GameRoomHeader.tsx", import.meta.url),
    "utf8",
  );
  const html = renderToStaticMarkup(
    <GameRoomHeader roomCode="ABCD" connected={true} onLeaveRoom={() => undefined} />,
  );

  assert.match(html, /Бункер/);
  assert.doesNotMatch(html, /Протокол выживания/);
  assert.match(html, /ABCD/);
  assert.match(html, /Связь установлена/);
  assert.doesNotMatch(html, /Админ-панель|Пропустить обсуждение/);
  assert.match(html, /aria-label="Выйти из комнаты"/);
  assert.match(headerSource, /import \{ GiFalloutShelter \} from "react-icons\/gi"/);
  assert.match(headerSource, /<GiFalloutShelter \/>/);
  assert.doesNotMatch(headerSource, /GiBunker|FiHome|canManageGame|canSkipDiscussion/);
});

test("room header reports a disconnected room without game management", () => {
  const html = renderToStaticMarkup(
    <GameRoomHeader roomCode="WXYZ" connected={false} onLeaveRoom={() => undefined} />,
  );

  assert.doesNotMatch(html, /aria-label="Управление игрой"/);
  assert.match(html, /Нет соединения/);
});

test("game screen moves game and host actions into the persistent command bar", () => {
  const source = readFileSync(new URL("../../src/screens/GameScreen.tsx", import.meta.url), "utf8");
  const viewSource = readFileSync(
    new URL("../../src/screens/game/gameScreenViewModel.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /<GameRoomHeader/);
  assert.match(source, /roomCode=\{roomCode\}/);
  assert.match(source, /onLeaveRoom=\{leaveRoom\}/);
  assert.match(source, /<GameCommandBar/);
  assert.match(source, /onOpenHostControls=\{openHostControls\}/);
  assert.match(source, /onSkipDiscussion=\{adminSkipDiscussion\}/);
  assert.match(source, /className="screen command-game-screen has-game-command-bar"/);
  assert.doesNotMatch(source, /view\.hasBottomAction/);
  assert.doesNotMatch(viewSource, /hasBottomAction/);
});

test("home room-code inputs accept exactly four canonical letters", () => {
  const source = readFileSync(new URL("../../src/screens/HomeScreen.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /import \{ ROOM_CODE_LENGTH, sanitizeRoomCodeInput \} from "\.\.\/\.\.\/\.\.\/shared\/roomCode"/,
  );
  assert.equal((source.match(/sanitizeRoomCodeInput\(e\.target\.value\)/g) ?? []).length, 2);
  assert.equal((source.match(/maxLength=\{ROOM_CODE_LENGTH\}/g) ?? []).length, 2);
  assert.equal(
    (source.match(/disabled=\{joinCode\.length !== ROOM_CODE_LENGTH\}/g) ?? []).length,
    2,
  );
  assert.equal((source.match(/Код комнаты \(4 буквы\)/g) ?? []).length, 2);
});

test("command bar shows the current player on the left and all host actions on the right", async () => {
  const componentUrl = new URL("../../src/screens/game/GameCommandBar.tsx", import.meta.url);
  assert.equal(existsSync(componentUrl), true, "GameCommandBar component must exist");
  const { GameCommandBar } = await import("../../src/screens/game/GameCommandBar.tsx");
  const currentTurnPlayer: PlayerInfo = {
    ...other,
    revealedAttributes: [{ type: "profession", label: "Профессия", value: "Врач" }],
  };

  const html = renderToStaticMarkup(
    <GameCommandBar
      currentTurnPlayer={currentTurnPlayer}
      isMyTurn={false}
      phaseLabel="Раскрытие карт"
      phaseDescription="Сейчас ходит Михаил"
      canReveal={true}
      canRevealAction={true}
      canManageGame={true}
      canSkipDiscussion={true}
      hostControlsOpen={false}
      onReveal={() => undefined}
      onRevealAction={() => undefined}
      onOpenHostControls={() => undefined}
      onSkipDiscussion={() => undefined}
    />,
  );

  assert.match(html, /aria-label="Панель хода и игровых действий"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Сейчас ходит Михаил/);
  assert.match(html, /Профессия: Врач/);
  assert.match(html, />Раскрыть особое условие</);
  assert.match(html, />Пропустить обсуждение</);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, />Админ-панель</);
  assert.match(html, />Раскрыть характеристику</);
  assert.equal((html.match(/<button/g) ?? []).length, 4);
});

test("command bar keeps host controls visible outside discussion and falls back to phase copy", async () => {
  const componentUrl = new URL("../../src/screens/game/GameCommandBar.tsx", import.meta.url);
  assert.equal(existsSync(componentUrl), true, "GameCommandBar component must exist");
  const { GameCommandBar } = await import("../../src/screens/game/GameCommandBar.tsx");
  const html = renderToStaticMarkup(
    <GameCommandBar
      currentTurnPlayer={undefined}
      isMyTurn={false}
      phaseLabel="Обсуждение"
      phaseDescription="Обсудите, кого оставить за пределами бункера"
      canReveal={false}
      canRevealAction={false}
      canManageGame={true}
      canSkipDiscussion={false}
      hostControlsOpen={true}
      onReveal={() => undefined}
      onRevealAction={() => undefined}
      onOpenHostControls={() => undefined}
      onSkipDiscussion={() => undefined}
    />,
  );

  assert.match(html, /Обсуждение/);
  assert.match(html, /Обсудите, кого оставить за пределами бункера/);
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*>[\s\S]*?Пропустить обсуждение[\s\S]*?<\/button>/,
  );
  assert.match(html, /aria-expanded="true"/);
  assert.equal((html.match(/<button/g) ?? []).length, 2);
});

test("command bar stays present without actions for a non-host observer", async () => {
  const componentUrl = new URL("../../src/screens/game/GameCommandBar.tsx", import.meta.url);
  assert.equal(existsSync(componentUrl), true, "GameCommandBar component must exist");
  const { GameCommandBar } = await import("../../src/screens/game/GameCommandBar.tsx");
  const html = renderToStaticMarkup(
    <GameCommandBar
      currentTurnPlayer={other}
      isMyTurn={false}
      phaseLabel="Раскрытие карт"
      phaseDescription="Сейчас ходит Михаил"
      canReveal={false}
      canRevealAction={false}
      canManageGame={false}
      canSkipDiscussion={false}
      hostControlsOpen={false}
      onReveal={() => undefined}
      onRevealAction={() => undefined}
      onOpenHostControls={() => undefined}
      onSkipDiscussion={() => undefined}
    />,
  );

  assert.match(html, /Сейчас ходит Михаил/);
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /Админ-панель|Пропустить обсуждение/);
});

test("vote screen keeps host controls in the common render path", () => {
  const source = readFileSync(new URL("../../src/screens/VoteScreen.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /if \(!canVote\) \{\s*return \(/);
  assert.doesNotMatch(source, /if \(voted\) \{\s*return \(/);
  assert.match(source, /className=\{`admin-panel vote-admin-panel/);
  assert.match(source, /const adminPauseActiveRef = useRef\(false\);/);
  assert.match(source, /const closeAdminPanel = useCallback/);
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*return \(\) => \{[^}]*adminPauseActiveRef\.current = false;\s*adminUnpause\(\);/s,
  );
  assert.match(source, /if \(!confirmTarget \|\| adminPauseActiveRef\.current\) return;/);
  assert.match(
    source,
    /<\/div>\s*\{error && <div className="error-toast">\{error\}<\/div>\}\s*\{\/\* Host Admin Panel \*\//,
  );
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
  const source = readFileSync(
    new URL("../../src/screens/game/ScenarioSummary.tsx", import.meta.url),
    "utf8",
  );

  assert.match(html, /<h3 class="gs-bunker-heading"/);
  assert.match(html, /class="gs-bunker-heading-icon"[^>]*aria-hidden="true"/);
  assert.match(source, /import \{ GiFalloutShelter \} from "react-icons\/gi"/);
  assert.match(source, /<GiFalloutShelter className="gs-bunker-heading-icon"/);
  assert.doesNotMatch(source, /GiBunker/);
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

test("player cards compact revealed characteristics into their canonical order", () => {
  const publicPlayer: PlayerInfo = {
    ...player,
    revealedAttributes: [
      { type: "fact", label: "Доп. факт", value: "Знает азбуку Морзе" },
      { type: "health", label: "Здоровье", value: "Здорова" },
      { type: "profession", label: "Профессия", value: "Врач" },
      { type: "bio", label: "Биология", value: "Женщина, 32 года" },
    ],
  };
  const html = renderToStaticMarkup(
    <PlayerBoard
      players={[publicPlayer]}
      playerId={null}
      currentTurnPlayerId={null}
      lastEliminatedPlayerId={null}
      onSelectPlayer={() => undefined}
    />,
  );

  const professionIndex = html.indexOf('data-attr-type="profession"');
  const bioIndex = html.indexOf('data-attr-type="bio"');
  const healthIndex = html.indexOf('data-attr-type="health"');
  const factIndex = html.indexOf('data-attr-type="fact"');

  assert.ok(professionIndex < bioIndex);
  assert.ok(bioIndex < healthIndex);
  assert.ok(healthIndex < factIndex);
  assert.equal((html.match(/class="gs-public-attribute"/g) ?? []).length, 4);
  assert.doesNotMatch(html, /gs-empty-copy/);
});

test("player cards illustrate every public characteristic and mark eliminated players", () => {
  const publicPlayer: PlayerInfo = {
    ...player,
    alive: false,
    revealedAttributes: [
      { type: "profession", label: "Профессия", value: "Врач" },
      { type: "bio", label: "Биология", value: "Женщина, 32 года" },
      { type: "health", label: "Здоровье", value: "Здорова" },
      { type: "hobby", label: "Хобби", value: "Шахматы" },
      { type: "baggage", label: "Багаж", value: "Аптечка" },
      { type: "fact", label: "Доп. факт", value: "Знает азбуку Морзе" },
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
  assert.equal((html.match(/class="gs-public-attribute-icon"/g) ?? []).length, 7);
  assert.equal((html.match(/class="gs-public-attribute-copy"/g) ?? []).length, 7);
  assert.ok(html.indexOf("Особое условие") > html.indexOf("Знает азбуку Морзе"));
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
    /\.command-game-screen \.gs-public-attributes \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-public-attribute \{[^}]*grid-template-columns: 30px minmax\(0, 1fr\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-public-attribute\[data-attr-type="action"\] \{[^}]*grid-column: 1 \/ -1;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-public-attribute-visual \{[^}]*place-items: center;[^}]*padding: 1px;[^}]*overflow: visible;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-public-attribute-icon \{[^}]*width: 100%;[^}]*height: 100%;[^}]*border-radius: 0;[^}]*overflow: visible;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-public-attribute-copy > span \{[^}]*font-size: 0\.6rem !important;/s,
  );
  assert.match(
    css,
    /@media \(min-width: 769px\)[\s\S]*\.command-game-screen \.gs-public-attribute-copy \{[^}]*gap: 0;[\s\S]*\.command-game-screen \.gs-public-attribute-copy > span \{[^}]*font-size: 0\.58rem;[^}]*line-height: 1\.1;[\s\S]*\.command-game-screen \.gs-public-attribute-copy strong \{[^}]*font-size: 0\.8rem;[^}]*line-height: 1\.2;/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-public-attribute-copy > span \{[^}]*font-size: 0\.75rem;/,
  );
});

test("persistent command bar uses left status and right actions without header host controls", () => {
  const css = readFileSync(new URL("../../src/styles/game-screen.css", import.meta.url), "utf8");
  const mobileCss = css.slice(css.indexOf("@media (max-width: 768px)"));

  assert.match(
    css,
    /\.command-game-screen \.gs-host-dialog-panel \{[^}]*width: min\(100%, 1040px\);/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-host-control-groups \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s,
  );
  assert.doesNotMatch(css, /\.gs-room-host-actions|\.gs-room-host-action/);
  assert.match(
    css,
    /\.command-game-screen \.gs-action-bar \{[^}]*left: 18px;[^}]*right: 18px;[^}]*bottom: 12px;[^}]*width: auto;[^}]*grid-template-columns: minmax\(220px, 1fr\) auto;[^}]*border-radius: 16px;/s,
  );
  assert.match(
    css,
    /\.command-game-screen \.gs-command-actions \{[^}]*display: flex;[^}]*flex-wrap: wrap;[^}]*justify-content: flex-end;/s,
  );
  assert.match(
    css,
    /\.screen\.command-game-screen\.has-game-command-bar \{[^}]*padding-bottom: calc\(104px \+ env\(safe-area-inset-bottom\)\);/s,
  );
  assert.match(
    css,
    /@media \(min-width: 769px\) and \(max-width: 1023px\)[\s\S]*\.screen\.command-game-screen\.has-game-command-bar:has\(\.gs-command-actions > :nth-child\(3\)\) \{[^}]*padding-bottom: calc\(152px \+ env\(safe-area-inset-bottom\)\);/,
  );
  assert.match(
    css,
    /@media \(min-width: 769px\) and \(max-width: 1023px\)[\s\S]*\.screen\.command-game-screen\.has-game-command-bar:has\(\.gs-command-actions > :nth-child\(3\)\)\s*\.error-toast \{[^}]*bottom: calc\(152px \+ env\(safe-area-inset-bottom\)\);/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-info-scenario,[\s\S]*\.command-game-screen \.gs-info-capacity,[\s\S]*\.command-game-screen \.gs-info-progress \{[^}]*display: none;/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-action-bar \{[^}]*left: 8px;[^}]*right: 8px;[^}]*bottom: 8px;[^}]*grid-template-columns: 1fr;/,
  );
  assert.match(mobileCss, /\.command-game-screen \.gs-action-bar \{[^}]*gap: 0;/s);
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-command-actions \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*\.command-game-screen \.gs-action-bar \.btn \{[^}]*min-height: 44px;/,
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
    mobileCss,
    /\.command-game-screen \.gs-command-status \{[^}]*position: absolute;[^}]*width: 1px;[^}]*height: 1px;[^}]*overflow: hidden;[^}]*clip-path: inset\(50%\);/s,
  );
  assert.doesNotMatch(
    mobileCss,
    /\.command-game-screen \.gs-command-status \{[^}]*display: none;/s,
  );
  assert.match(
    mobileCss,
    /\.command-game-screen \.gs-action-bar:not\(:has\(\.gs-command-actions > \*\)\) \{[^}]*right: auto;[^}]*width: 1px;[^}]*height: 1px;[^}]*padding: 0;[^}]*overflow: hidden;[^}]*background: transparent;[^}]*border: 0;[^}]*box-shadow: none;[^}]*pointer-events: none;/s,
  );
  assert.doesNotMatch(
    mobileCss,
    /\.command-game-screen \.gs-action-bar:not\(:has\(\.gs-command-actions > \*\)\) \{[^}]*display: none;/s,
  );
  assert.match(
    mobileCss,
    /\.screen\.command-game-screen\.has-game-command-bar \{[^}]*padding-bottom: calc\(80px \+ env\(safe-area-inset-bottom\)\);/s,
  );
  assert.match(
    mobileCss,
    /\.screen\.command-game-screen\.has-game-command-bar:has\(\.gs-command-actions > :nth-child\(3\)\) \{[^}]*padding-bottom: calc\(140px \+ env\(safe-area-inset-bottom\)\);/s,
  );
  assert.match(
    mobileCss,
    /\.screen\.command-game-screen\.has-game-command-bar:not\(:has\(\.gs-command-actions > \*\)\) \{[^}]*padding-bottom: calc\(16px \+ env\(safe-area-inset-bottom\)\);/s,
  );
  assert.match(
    mobileCss,
    /\.screen\.command-game-screen\.has-game-command-bar \.error-toast \{[^}]*bottom: calc\(80px \+ env\(safe-area-inset-bottom\)\);/s,
  );
  assert.match(
    mobileCss,
    /\.screen\.command-game-screen\.has-game-command-bar:has\(\.gs-command-actions > :nth-child\(3\)\)\s*\.error-toast \{[^}]*bottom: calc\(140px \+ env\(safe-area-inset-bottom\)\);/s,
  );
  assert.match(
    mobileCss,
    /\.screen\.command-game-screen\.has-game-command-bar:not\(:has\(\.gs-command-actions > \*\)\)\s*\.error-toast \{[^}]*bottom: calc\(24px \+ env\(safe-area-inset-bottom\)\);/s,
  );
  assert.doesNotMatch(mobileCss, /calc\(184px/);
});

test("vote admin panel remains fixed above responsive content", () => {
  const css = readFileSync(new URL("../../src/styles/global.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.vote-admin-panel \{[^}]*position: fixed;[^}]*z-index: 90;[^}]*max-height: calc\(100dvh - 24px\);/s,
  );
  assert.match(css, /\.modal-overlay \{[^}]*z-index: 100;/s);
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
