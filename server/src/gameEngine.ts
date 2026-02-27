import { Server } from "socket.io";
import {
  PublicGameState,
  PlayerInfo,
  Attribute,
  FullAttribute,
  ServerEvents,
  ClientEvents,
  BunkerCard,
  ThreatCard,
} from "../../shared/types.js";
import { Room, GameState, Player, getAlivePlayers, touchRoom } from "./roomManager.js";
import { generateCharacter } from "./characterGenerator.js";
import { catastrophes } from "./data/catastrophes.js";
import { bunkerCards as allBunkerCardsData } from "./data/bunkers.js";
import { threatCards as allThreatCardsData } from "./data/threats.js";
import { randomPick, shuffle } from "./utils.js";
import { CONFIG } from "./config.js";
import { scheduleBotActions } from "./botManager.js";

type IOServer = Server<ClientEvents, ServerEvents>;

// ============ Voting Schedule Table (from original rules) ============
// Returns number of votings per round for a given player count
function getVotingSchedule(playerCount: number): number[] {
  const bunkerCapacity = Math.floor(playerCount / 2);
  const totalEliminations = playerCount - bunkerCapacity;

  // Distribute eliminations across 5 rounds
  // Pattern from rules: fill rounds 2-5 first, then round 1, then add doubles
  const schedule = [0, 0, 0, 0, 0];
  let remaining = totalEliminations;

  // First pass: 1 vote each for rounds 2, 3, 4, 5
  for (let i = 1; i <= 4 && remaining > 0; i++) {
    schedule[i] = 1;
    remaining--;
  }

  // Add to round 1 if needed
  if (remaining > 0) {
    schedule[0] = 1;
    remaining--;
  }

  // Add second votes to later rounds first (4, 3, 2, 1)
  for (let i = 4; i >= 1 && remaining > 0; i--) {
    schedule[i]++;
    remaining--;
  }

  // If still remaining, add to round 1
  if (remaining > 0) {
    schedule[0]++;
    remaining--;
  }

  return schedule;
}

export function startGame(room: Room, io: IOServer): void {
  const playerCount = room.players.size;
  const bunkerCapacity = Math.floor(playerCount / 2);
  const votingSchedule = getVotingSchedule(playerCount);

  const catastrophe = randomPick(catastrophes);

  // Dynamic bunker cards count based on player count
  const bunkerCardsCount = playerCount <= 4 ? 3 : playerCount <= 5 ? 4 : 5;
  const shuffledBunkerCards = shuffle([...allBunkerCardsData]);
  const gameBunkerCards = shuffledBunkerCards.slice(0, bunkerCardsCount);

  // Threat card only for 6+ players
  const threatCard = playerCount >= 6 ? randomPick(allThreatCardsData) : null;

  // Generate characters
  const usedProfessions = new Set<string>();
  for (const player of room.players.values()) {
    player.character = generateCharacter(usedProfessions);
    player.alive = true;
    player.revealedIndices = [];
    player.hasVoted = false;
    player.votedFor = null;
    player.immuneThisRound = false;
  }

  room.allPlayerIds = Array.from(room.players.keys());

  room.gameState = {
    phase: "CATASTROPHE_REVEAL",
    roundNumber: 0,
    catastrophe,
    bunkerCards: gameBunkerCards,
    revealedBunkerCount: 0,
    threatCard,
    bunkerCapacity,
    turnOrder: [],
    currentTurnIndex: 0,
    votes: new Map(),
    eliminationOrder: [],
    votingSchedule,
    currentVotingInRound: 0,
    roundStarterIndex: 0,
    lastEliminatedId: null,
    tiebreakCandidateIds: [],
    phaseTimer: null,
    phaseEndTime: null,
    paused: false,
    pausedTimeRemaining: null,
    pausedCallback: null,
  };

  // Send each player their character privately
  for (const player of room.players.values()) {
    const socket = io.sockets.sockets.get(player.socketId);
    if (socket && player.character) {
      socket.emit("game:character", player.character);
    }
  }

  broadcastState(room, io);

  // Auto-advance after catastrophe reveal
  schedulePhaseTransition(room, io, CONFIG.CATASTROPHE_REVEAL_TIME, () => {
    startNewRound(room, io);
  });
}

function schedulePhaseTransition(
  room: Room,
  io: IOServer,
  delay: number,
  callback: () => void,
): void {
  if (room.gameState?.phaseTimer) {
    clearTimeout(room.gameState.phaseTimer);
  }
  if (room.gameState) {
    // Save callback so it can be resumed after unpause
    room.gameState.pausedCallback = callback;
    room.gameState.phaseEndTime = Date.now() + delay;
    room.gameState.phaseTimer = setTimeout(() => {
      if (room.gameState) {
        room.gameState.phaseTimer = null;
        room.gameState.phaseEndTime = null;
        room.gameState.pausedCallback = null;
      }
      callback();
    }, delay);
  }
}

// ============ Round Flow ============
// 1. Bunker Exploration (reveal 1 bunker card)
// 2. Card Reveal Circle (players reveal attributes one by one)
// 3. Voting(s) if scheduled for this round
// 4. Next round or game end

function startNewRound(room: Room, io: IOServer): void {
  if (!room.gameState) return;

  room.gameState.roundNumber++;
  room.gameState.currentVotingInRound = 0;

  // Start with bunker exploration
  startBunkerExplore(room, io);
}

function startBunkerExplore(room: Room, io: IOServer): void {
  if (!room.gameState) return;

  // Skip explore phase if all bunker cards already revealed
  if (room.gameState.revealedBunkerCount >= room.gameState.bunkerCards.length) {
    startRevealPhase(room, io);
    return;
  }

  room.gameState.phase = "BUNKER_EXPLORE";
  room.gameState.revealedBunkerCount++;

  broadcastState(room, io);

  // Auto-advance to card reveal
  schedulePhaseTransition(room, io, CONFIG.BUNKER_EXPLORE_TIME, () => {
    startRevealPhase(room, io);
  });
}

function startRevealPhase(room: Room, io: IOServer): void {
  if (!room.gameState) return;
  room.gameState.phase = "ROUND_REVEAL";

  // Build turn order: alive players in original join order (1 to N)
  const alivePlayers = getAlivePlayers(room);
  room.gameState.turnOrder = alivePlayers.map((p) => p.id);
  room.gameState.currentTurnIndex = 0;

  broadcastState(room, io);
}

export function revealAttribute(
  room: Room,
  playerId: string,
  attributeIndex: number | undefined,
  io: IOServer,
): boolean {
  if (!room.gameState || room.gameState.phase !== "ROUND_REVEAL") return false;

  const player = room.players.get(playerId);
  if (!player || !player.alive || !player.character) return false;

  // Check if it's this player's turn
  const currentTurnPlayerId = room.gameState.turnOrder[room.gameState.currentTurnIndex];
  if (currentTurnPlayerId !== playerId) return false;

  // Player chooses which attribute to reveal (rounds 2+)
  const totalAttrs = player.character.attributes.length;
  const unrevealed = [];
  for (let i = 0; i < totalAttrs; i++) {
    if (!player.revealedIndices.includes(i)) {
      unrevealed.push(i);
    }
  }

  if (unrevealed.length === 0) return false;

  // One card must stay hidden until finale (only allow reveal if >1 unrevealed)
  if (unrevealed.length <= 1) {
    // This is the last hidden card — can't reveal it until finale
    // Skip this player's turn
    room.gameState.currentTurnIndex++;
    if (room.gameState.currentTurnIndex >= room.gameState.turnOrder.length) {
      afterRevealPhase(room, io);
    } else {
      broadcastState(room, io);
    }
    return true;
  }

  let idxToReveal: number;
  if (room.gameState.roundNumber === 1) {
    // Round 1: must reveal profession (index 0)
    idxToReveal = 0;
  } else if (attributeIndex !== undefined && unrevealed.includes(attributeIndex)) {
    idxToReveal = attributeIndex;
  } else {
    // Default: reveal next unrevealed
    idxToReveal = unrevealed[0];
  }

  player.revealedIndices.push(idxToReveal);

  // Notify all clients about the revealed attribute
  const revealedAttr = player.character.attributes[idxToReveal];
  io.to(room.code).emit("game:attributeRevealed", {
    playerName: player.name,
    attribute: revealedAttr,
  });

  // Move to next player's turn
  room.gameState.currentTurnIndex++;

  if (room.gameState.currentTurnIndex >= room.gameState.turnOrder.length) {
    afterRevealPhase(room, io);
  } else {
    broadcastState(room, io);
  }

  return true;
}

function afterRevealPhase(room: Room, io: IOServer): void {
  if (!room.gameState) return;

  const roundIdx = room.gameState.roundNumber - 1;
  const votingsThisRound = room.gameState.votingSchedule[roundIdx] || 0;

  if (votingsThisRound > 0) {
    // Start discussion before first voting
    startDiscussionPhase(room, io);
  } else {
    // No voting this round — advance to next round or end
    advanceRoundOrEnd(room, io);
  }
}

function startDiscussionPhase(room: Room, io: IOServer): void {
  if (!room.gameState) return;
  room.gameState.phase = "ROUND_DISCUSSION";
  broadcastState(room, io);

  schedulePhaseTransition(room, io, CONFIG.DISCUSSION_TIME, () => {
    startVotePhase(room, io);
  });
}

export function skipDiscussion(room: Room, io: IOServer): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };
  if (room.gameState.phase !== "ROUND_DISCUSSION")
    return { success: false, error: "Сейчас не фаза обсуждения" };

  if (room.gameState.phaseTimer) clearTimeout(room.gameState.phaseTimer);
  room.gameState.phaseTimer = null;
  room.gameState.phaseEndTime = null;
  room.gameState.pausedCallback = null;

  startVotePhase(room, io);
  return { success: true, error: "" };
}

function startVotePhase(room: Room, io: IOServer): void {
  if (!room.gameState) return;
  room.gameState.phase = "ROUND_VOTE";
  room.gameState.votes.clear();
  room.gameState.tiebreakCandidateIds = [];

  // Reset vote state — alive players AND last eliminated player can vote
  for (const player of room.players.values()) {
    player.hasVoted = false;
    player.votedFor = null;
  }

  broadcastState(room, io);

  schedulePhaseTransition(room, io, CONFIG.VOTE_TIME, () => {
    tallyVotes(room, io);
  });
}

function getVoters(room: Room): Player[] {
  if (!room.gameState) return [];
  const voters: Player[] = [];

  for (const player of room.players.values()) {
    if (player.alive) {
      voters.push(player);
    }
  }

  // Last eliminated player also votes (per original rules)
  if (room.gameState.lastEliminatedId) {
    const lastElim = room.players.get(room.gameState.lastEliminatedId);
    if (lastElim && !lastElim.alive) {
      voters.push(lastElim);
    }
  }

  return voters;
}

export function castVote(room: Room, voterId: string, targetId: string, io: IOServer): boolean {
  if (!room.gameState) return false;
  if (room.gameState.phase !== "ROUND_VOTE" && room.gameState.phase !== "ROUND_VOTE_TIEBREAK")
    return false;

  const voter = room.players.get(voterId);
  const target = room.players.get(targetId);
  if (!voter || !target || !target.alive) return false;
  if (voterId === targetId) return false;
  if (voter.hasVoted) return false;

  // Check voter is eligible (alive OR last eliminated)
  const isAlive = voter.alive;
  const isLastEliminated = voter.id === room.gameState.lastEliminatedId;
  if (!isAlive && !isLastEliminated) return false;

  // In tiebreak, can only vote for tiebreak candidates
  if (room.gameState.phase === "ROUND_VOTE_TIEBREAK") {
    if (!room.gameState.tiebreakCandidateIds.includes(targetId)) return false;
  }

  voter.hasVoted = true;
  voter.votedFor = targetId;
  room.gameState.votes.set(voterId, targetId);

  broadcastState(room, io);

  // Check if all voters have voted
  const voters = getVoters(room);
  const allVoted = voters.every((p) => p.hasVoted);
  if (allVoted) {
    if (room.gameState.phaseTimer) clearTimeout(room.gameState.phaseTimer);
    room.gameState.phaseTimer = null;
    room.gameState.phaseEndTime = null;
    tallyVotes(room, io);
  }

  return true;
}

function tallyVotes(room: Room, io: IOServer): void {
  if (!room.gameState) return;

  const isTiebreak = room.gameState.phase === "ROUND_VOTE_TIEBREAK";
  const voteCounts = new Map<string, number>();
  const alivePlayers = getAlivePlayers(room);

  // Initialize counts for eligible candidates
  if (isTiebreak) {
    for (const id of room.gameState.tiebreakCandidateIds) {
      voteCounts.set(id, 0);
    }
  } else {
    for (const player of alivePlayers) {
      voteCounts.set(player.id, 0);
    }
  }

  for (const [voterId, targetId] of room.gameState.votes) {
    if (!voteCounts.has(targetId)) continue;
    voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
  }

  // Find max votes
  let maxVotes = 0;
  for (const count of voteCounts.values()) {
    if (count > maxVotes) maxVotes = count;
  }

  if (maxVotes === 0) {
    // No votes cast — skip elimination
    afterVoting(room, io);
    return;
  }

  // Find all players with max votes
  const candidates = Array.from(voteCounts.entries())
    .filter(([_, count]) => count === maxVotes)
    .map(([id]) => id);

  if (candidates.length === 1) {
    // Clear winner — eliminate
    eliminatePlayer(room, candidates[0], io);
  } else if (isTiebreak) {
    // Already had a tiebreak — random elimination per rules
    const randomElim = candidates[Math.floor(Math.random() * candidates.length)];
    eliminatePlayer(room, randomElim, io);
  } else {
    // Tie — start tiebreak: defense speeches then re-vote
    room.gameState.tiebreakCandidateIds = candidates;
    startTiebreak(room, io);
  }
}

function startTiebreak(room: Room, io: IOServer): void {
  if (!room.gameState) return;

  room.gameState.phase = "ROUND_VOTE_TIEBREAK";
  room.gameState.votes.clear();

  // Reset votes
  for (const player of room.players.values()) {
    player.hasVoted = false;
    player.votedFor = null;
  }

  broadcastState(room, io);

  // Give defense time, then start tiebreak vote
  schedulePhaseTransition(room, io, CONFIG.TIEBREAK_DEFENSE_TIME, () => {
    // Now actually collect votes (re-use ROUND_VOTE_TIEBREAK phase)
    broadcastState(room, io);
    schedulePhaseTransition(room, io, CONFIG.VOTE_TIME, () => {
      tallyVotes(room, io);
    });
  });
}

function eliminatePlayer(room: Room, playerId: string, io: IOServer): void {
  if (!room.gameState) return;

  const player = room.players.get(playerId);
  if (!player) return;

  // Check immunity
  if (player.immuneThisRound) {
    room.gameState.phase = "ROUND_RESULT";
    broadcastState(room, io);
    schedulePhaseTransition(room, io, CONFIG.RESULT_DISPLAY_TIME, () => {
      afterVoting(room, io);
    });
    return;
  }

  player.alive = false;
  room.gameState.eliminationOrder.push(playerId);
  room.gameState.lastEliminatedId = playerId;
  room.gameState.phase = "ROUND_RESULT";

  io.to(room.code).emit("game:eliminated", {
    playerId,
    playerName: player.name,
  });

  broadcastState(room, io);

  // Reset round-specific flags
  for (const p of room.players.values()) {
    p.immuneThisRound = false;
  }

  schedulePhaseTransition(room, io, CONFIG.RESULT_DISPLAY_TIME, () => {
    afterVoting(room, io);
  });
}

function afterVoting(room: Room, io: IOServer): void {
  if (!room.gameState) return;

  room.gameState.currentVotingInRound++;
  const roundIdx = room.gameState.roundNumber - 1;
  const votingsThisRound = room.gameState.votingSchedule[roundIdx] || 0;

  if (room.gameState.currentVotingInRound < votingsThisRound) {
    // More votings in this round — start discussion for next vote
    startDiscussionPhase(room, io);
  } else {
    advanceRoundOrEnd(room, io);
  }
}

function advanceRoundOrEnd(room: Room, io: IOServer): void {
  if (!room.gameState) return;

  if (room.gameState.roundNumber >= CONFIG.TOTAL_ROUNDS) {
    // Game over after 5 rounds
    room.gameState.phase = "GAME_OVER";
    broadcastState(room, io);
  } else {
    // Check if we still have enough players for elimination
    const alive = getAlivePlayers(room);
    if (alive.length <= room.gameState.bunkerCapacity) {
      room.gameState.phase = "GAME_OVER";
      broadcastState(room, io);
    } else {
      startNewRound(room, io);
    }
  }
}

// ============ Reveal Action Card ============

export function revealActionCard(room: Room, playerId: string, io: IOServer): boolean {
  if (!room.gameState) return false;
  const player = room.players.get(playerId);
  if (!player || !player.character || player.actionCardRevealed) return false;

  player.actionCardRevealed = true;

  // Notify all clients about the action card reveal for the fullscreen modal
  io.to(room.code).emit("game:actionCardRevealed", {
    playerName: player.name,
    actionCard: player.character.actionCard,
  });

  broadcastState(room, io);
  return true;
}

// ============ Admin Panel Functions ============

export function adminShuffleAll(
  room: Room,
  attributeType: string,
  io: IOServer,
): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };

  const alivePlayers = getAlivePlayers(room).filter((p) => p.character);
  if (alivePlayers.length < 2) return { success: false, error: "Недостаточно игроков" };

  if (attributeType === "action") {
    // Shuffle action cards among alive players
    const actionCards = alivePlayers.map((p) => p.character!.actionCard);
    const shuffled = shuffle([...actionCards]);
    for (let i = 0; i < alivePlayers.length; i++) {
      alivePlayers[i].character!.actionCard = shuffled[i];
      alivePlayers[i].actionCardRevealed = false;
    }
  } else {
    // Collect all attributes of this type
    const attrs: { playerIdx: number; attrIdx: number; attr: any }[] = [];
    for (const player of alivePlayers) {
      const idx = player.character!.attributes.findIndex((a) => a.type === attributeType);
      if (idx !== -1) {
        attrs.push({ playerIdx: 0, attrIdx: idx, attr: player.character!.attributes[idx] });
      }
    }

    if (attrs.length < 2) return { success: false, error: "Недостаточно карт для перемешивания" };

    // Shuffle attributes
    const shuffled = shuffle(attrs.map((a) => a.attr));

    // Redistribute
    let i = 0;
    for (const player of alivePlayers) {
      const idx = player.character!.attributes.findIndex((a) => a.type === attributeType);
      if (idx !== -1 && i < shuffled.length) {
        player.character!.attributes[idx] = shuffled[i];
        i++;
      }
    }
  }

  // Resend characters to all affected players
  for (const player of alivePlayers) {
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock && player.character) {
      sock.emit("game:character", player.character);
    }
  }

  broadcastState(room, io);
  return { success: true, error: "" };
}

export function adminSwapAttribute(
  room: Room,
  p1Id: string,
  p2Id: string,
  attributeType: string,
  io: IOServer,
): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };

  const p1 = room.players.get(p1Id);
  const p2 = room.players.get(p2Id);
  if (!p1?.character || !p2?.character) return { success: false, error: "Игрок не найден" };

  if (attributeType === "action") {
    const temp = p1.character.actionCard;
    p1.character.actionCard = p2.character.actionCard;
    p2.character.actionCard = temp;
    p1.actionCardRevealed = false;
    p2.actionCardRevealed = false;
  } else {
    const idx1 = p1.character.attributes.findIndex((a) => a.type === attributeType);
    const idx2 = p2.character.attributes.findIndex((a) => a.type === attributeType);
    if (idx1 === -1 || idx2 === -1) return { success: false, error: "Атрибут не найден" };

    // Swap
    const temp = p1.character.attributes[idx1];
    p1.character.attributes[idx1] = p2.character.attributes[idx2];
    p2.character.attributes[idx2] = temp;
  }

  // Resend characters
  for (const p of [p1, p2]) {
    const sock = io.sockets.sockets.get(p.socketId);
    if (sock && p.character) {
      sock.emit("game:character", p.character);
    }
  }

  broadcastState(room, io);
  return { success: true, error: "" };
}

export function adminReplaceAttribute(
  room: Room,
  targetPlayerId: string,
  attributeType: string,
  io: IOServer,
): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };

  const player = room.players.get(targetPlayerId);
  if (!player?.character) return { success: false, error: "Игрок не найден" };

  const usedProf = new Set<string>();
  const newChar = generateCharacter(usedProf);

  if (attributeType === "action") {
    player.character.actionCard = newChar.actionCard;
    player.actionCardRevealed = false;
  } else {
    const idx = player.character.attributes.findIndex((a) => a.type === attributeType);
    if (idx === -1) return { success: false, error: "Атрибут не найден" };

    const newIdx = newChar.attributes.findIndex((a) => a.type === attributeType);
    if (newIdx === -1) return { success: false, error: "Не удалось сгенерировать новую карту" };

    player.character.attributes[idx] = newChar.attributes[newIdx];
  }

  // Resend character
  const sock = io.sockets.sockets.get(player.socketId);
  if (sock && player.character) {
    sock.emit("game:character", player.character);
  }

  broadcastState(room, io);
  return { success: true, error: "" };
}

// ============ Bunker Card Admin ============

export function adminRemoveBunkerCard(
  room: Room,
  cardIndex: number,
  io: IOServer,
): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };
  if (cardIndex < 0 || cardIndex >= room.gameState.revealedBunkerCount) {
    return { success: false, error: "Неверный индекс карты бункера" };
  }

  room.gameState.bunkerCards.splice(cardIndex, 1);
  room.gameState.revealedBunkerCount--;

  broadcastState(room, io);
  return { success: true, error: "" };
}

export function adminReplaceBunkerCard(
  room: Room,
  cardIndex: number,
  io: IOServer,
): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };
  if (cardIndex < 0 || cardIndex >= room.gameState.revealedBunkerCount) {
    return { success: false, error: "Неверный индекс карты бункера" };
  }

  const currentTitles = new Set(room.gameState.bunkerCards.map((c) => c.title));
  const available = allBunkerCardsData.filter((c) => !currentTitles.has(c.title));
  if (available.length === 0) {
    return { success: false, error: "Нет доступных карт бункера для замены" };
  }

  const newCard = available[Math.floor(Math.random() * available.length)];
  room.gameState.bunkerCards[cardIndex] = { title: newCard.title, description: newCard.description };

  broadcastState(room, io);
  return { success: true, error: "" };
}

// ============ Attribute Admin (extended) ============

export function adminDeleteAttribute(
  room: Room,
  targetPlayerId: string,
  attributeType: string,
  io: IOServer,
): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };

  const player = room.players.get(targetPlayerId);
  if (!player?.character) return { success: false, error: "Игрок не найден" };

  const removedIdx = player.character.attributes.findIndex((a) => a.type === attributeType);
  if (removedIdx === -1) return { success: false, error: "Атрибут не найден" };

  player.character.attributes.splice(removedIdx, 1);
  player.revealedIndices = player.revealedIndices
    .filter((i) => i !== removedIdx)
    .map((i) => (i > removedIdx ? i - 1 : i));

  const sock = io.sockets.sockets.get(player.socketId);
  if (sock && player.character) {
    sock.emit("game:character", player.character);
  }

  broadcastState(room, io);
  return { success: true, error: "" };
}

export function adminForceRevealType(
  room: Room,
  attributeType: string,
  io: IOServer,
): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };

  for (const player of room.players.values()) {
    if (!player.alive || !player.character) continue;
    const idx = player.character.attributes.findIndex((a) => a.type === attributeType);
    if (idx !== -1 && !player.revealedIndices.includes(idx)) {
      player.revealedIndices.push(idx);
    }
  }

  broadcastState(room, io);
  return { success: true, error: "" };
}

// ============ Revive / Eliminate Player ============

export function adminRevivePlayer(
  room: Room,
  targetPlayerId: string,
  io: IOServer,
): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };

  const player = room.players.get(targetPlayerId);
  if (!player) return { success: false, error: "Игрок не найден" };
  if (player.alive) return { success: false, error: "Игрок уже в игре" };

  player.alive = true;

  // Remove from elimination order
  room.gameState.eliminationOrder = room.gameState.eliminationOrder.filter(
    (id) => id !== targetPlayerId,
  );

  // Clear lastEliminatedId if it was this player
  if (room.gameState.lastEliminatedId === targetPlayerId) {
    const order = room.gameState.eliminationOrder;
    room.gameState.lastEliminatedId = order.length > 0 ? order[order.length - 1] : null;
  }

  broadcastState(room, io);
  return { success: true, error: "" };
}

export function adminEliminatePlayer(
  room: Room,
  targetPlayerId: string,
  io: IOServer,
): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };

  const player = room.players.get(targetPlayerId);
  if (!player) return { success: false, error: "Игрок не найден" };
  if (!player.alive) return { success: false, error: "Игрок уже изгнан" };

  player.alive = false;
  room.gameState.eliminationOrder.push(targetPlayerId);
  room.gameState.lastEliminatedId = targetPlayerId;

  broadcastState(room, io);
  return { success: true, error: "" };
}

// ============ Pause / Unpause ============

export function pauseGame(room: Room, io: IOServer): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };
  if (room.gameState.paused) return { success: false, error: "Игра уже на паузе" };

  room.gameState.paused = true;

  // Save remaining time and clear the timer
  if (room.gameState.phaseTimer && room.gameState.phaseEndTime) {
    const remaining = Math.max(0, room.gameState.phaseEndTime - Date.now());
    room.gameState.pausedTimeRemaining = remaining;
    clearTimeout(room.gameState.phaseTimer);
    room.gameState.phaseTimer = null;
    room.gameState.phaseEndTime = null;
  }

  broadcastState(room, io);
  return { success: true, error: "" };
}

export function unpauseGame(room: Room, io: IOServer): { success: boolean; error: string } {
  if (!room.gameState) return { success: false, error: "Игра не запущена" };
  if (!room.gameState.paused) return { success: false, error: "Игра не на паузе" };

  room.gameState.paused = false;

  // Resume timer with remaining time
  if (room.gameState.pausedTimeRemaining != null && room.gameState.pausedCallback) {
    const remaining = room.gameState.pausedTimeRemaining;
    const callback = room.gameState.pausedCallback;
    room.gameState.pausedTimeRemaining = null;
    room.gameState.pausedCallback = null;
    schedulePhaseTransition(room, io, remaining, callback);
  }

  broadcastState(room, io);
  return { success: true, error: "" };
}

export function forceEndGame(room: Room, io: IOServer): void {
  if (!room.gameState) return;
  if (room.gameState.phaseTimer) clearTimeout(room.gameState.phaseTimer);
  room.gameState.phase = "GAME_OVER";
  room.gameState.phaseEndTime = null;
  broadcastState(room, io);
}

export function resetGame(room: Room, io: IOServer): void {
  if (room.gameState?.phaseTimer) clearTimeout(room.gameState.phaseTimer);
  room.gameState = null;

  for (const player of room.players.values()) {
    player.ready = false;
    player.alive = true;
    player.character = null;
    player.revealedIndices = [];
    player.hasVoted = false;
    player.votedFor = null;
    player.immuneThisRound = false;
    player.actionCardRevealed = false;
  }

  broadcastState(room, io);
}

export function buildPublicState(room: Room): PublicGameState {
  const gs = room.gameState;
  const isGameOver = gs?.phase === "GAME_OVER";
  const players: PlayerInfo[] = Array.from(room.players.values()).map((p) => {
    const revealedSet = new Set(p.revealedIndices);
    const info: PlayerInfo = {
      id: p.id,
      name: p.name,
      ready: p.ready,
      connected: p.connected,
      alive: p.alive,
      revealedAttributes: p.revealedIndices
        .map((i) => p.character?.attributes[i])
        .filter(Boolean) as Attribute[],
      actionCardRevealed: p.actionCardRevealed,
      isHost: p.id === room.hostId,
      isBot: p.isBot,
    };
    // Show action card if revealed by player or at game over
    if (p.character && (p.actionCardRevealed || isGameOver)) {
      info.actionCard = p.character.actionCard;
    }
    if (isGameOver && p.character) {
      const allAttrs: FullAttribute[] = p.character.attributes.map((attr, i) => ({
        ...attr,
        wasRevealed: revealedSet.has(i),
      }));
      info.allAttributes = allAttrs;
    }
    return info;
  });

  // Count voters (alive + last eliminated)
  const voters = gs ? getVoters_fromState(room) : [];
  const votedCount = voters.filter((p) => p.hasVoted).length;

  // Build vote results for ROUND_RESULT phase
  let voteResults: Record<string, number> | null = null;
  if (gs?.phase === "ROUND_RESULT" || gs?.phase === "GAME_OVER") {
    voteResults = {};
    for (const player of room.players.values()) {
      if (player.votedFor) {
        voteResults[player.votedFor] = (voteResults[player.votedFor] || 0) + 1;
      }
    }
  }

  let eliminatedPlayerId: string | null = null;
  if (gs?.phase === "ROUND_RESULT" && gs.eliminationOrder.length > 0) {
    eliminatedPlayerId = gs.eliminationOrder[gs.eliminationOrder.length - 1];
  }

  // Revealed bunker cards
  const revealedBunkerCards: BunkerCard[] = [];
  if (gs) {
    for (let i = 0; i < gs.revealedBunkerCount; i++) {
      revealedBunkerCards.push(gs.bunkerCards[i]);
    }
  }

  const roundIdx = (gs?.roundNumber || 1) - 1;

  return {
    phase: gs?.phase || "LOBBY",
    roundNumber: gs?.roundNumber || 0,
    totalRounds: CONFIG.TOTAL_ROUNDS,
    catastrophe: gs?.catastrophe || null,
    revealedBunkerCards,
    totalBunkerCards: gs?.bunkerCards.length || 0,
    threatCard: gs && gs.revealedBunkerCount >= gs.bunkerCards.length ? gs.threatCard : null,
    bunkerCapacity: gs?.bunkerCapacity || 0,
    players,
    currentTurnPlayerId:
      gs?.phase === "ROUND_REVEAL" ? gs.turnOrder[gs.currentTurnIndex] || null : null,
    votesCount: votedCount,
    totalVotesExpected: voters.length,
    voteResults,
    eliminatedPlayerId,
    votingSchedule: gs?.votingSchedule || [],
    currentVotingInRound: gs?.currentVotingInRound || 0,
    votingsInCurrentRound: gs?.votingSchedule[roundIdx] || 0,
    lastEliminatedPlayerId: gs?.lastEliminatedId || null,
    tiebreakCandidateIds: gs?.tiebreakCandidateIds?.length ? gs.tiebreakCandidateIds : null,
    phaseRemainingMs: gs?.phaseEndTime ? Math.max(0, gs.phaseEndTime - Date.now()) : null,
    paused: gs?.paused || false,
  };
}

// Helper to get voters without io dependency
function getVoters_fromState(room: Room): Player[] {
  if (!room.gameState) return [];
  const voters: Player[] = [];

  for (const player of room.players.values()) {
    if (player.alive) {
      voters.push(player);
    }
  }

  if (room.gameState.lastEliminatedId) {
    const lastElim = room.players.get(room.gameState.lastEliminatedId);
    if (lastElim && !lastElim.alive) {
      voters.push(lastElim);
    }
  }

  return voters;
}

export function broadcastState(room: Room, io: IOServer): void {
  const state = buildPublicState(room);
  io.to(room.code).emit("game:state", state);

  // Refresh room activity TTL
  touchRoom(room.code);

  // Schedule bot actions after state broadcast
  scheduleBotActions(room, io);
}
