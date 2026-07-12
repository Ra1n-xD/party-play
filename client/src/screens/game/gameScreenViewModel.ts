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

export function isExpandedActionCardPublic(
  isOwner: boolean,
  ownerActionCardRevealed: boolean,
): boolean {
  return !isOwner || ownerActionCardRevealed;
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
