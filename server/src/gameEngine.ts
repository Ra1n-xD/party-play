import { Server } from 'socket.io';
import { PublicGameState, PlayerInfo, Attribute, ServerEvents, ClientEvents, BunkerCard } from '../../shared/types.js';
import { Room, GameState, Player, getAlivePlayers } from './roomManager.js';
import { generateCharacter } from './characterGenerator.js';
import { catastrophes } from './data/catastrophes.js';
import { bunkerCards as allBunkerCardsData } from './data/bunkers.js';
import { randomPick, shuffle } from './utils.js';
import { CONFIG } from './config.js';
import { scheduleBotActions } from './botManager.js';

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

  // Pick 5 random bunker cards
  const shuffledBunkerCards = shuffle([...allBunkerCardsData]);
  const gameBunkerCards = shuffledBunkerCards.slice(0, CONFIG.BUNKER_CARDS_COUNT);

  // Generate characters
  const usedProfessions = new Set<string>();
  for (const player of room.players.values()) {
    player.character = generateCharacter(usedProfessions);
    player.alive = true;
    player.revealedIndices = [];
    player.hasVoted = false;
    player.votedFor = null;
    player.actionUsed = false;
    player.immuneThisRound = false;
    player.doubleVoteThisRound = false;
  }

  const playerIds = Array.from(room.players.keys());
  room.allPlayerIds = shuffle(playerIds);

  room.gameState = {
    phase: 'CATASTROPHE_REVEAL',
    roundNumber: 0,
    catastrophe,
    bunkerCards: gameBunkerCards,
    revealedBunkerCount: 0,
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
  };

  // Send each player their character privately
  for (const player of room.players.values()) {
    const socket = io.sockets.sockets.get(player.socketId);
    if (socket && player.character) {
      socket.emit('game:character', player.character);
    }
  }

  broadcastState(room, io);

  // Auto-advance after catastrophe reveal
  schedulePhaseTransition(room, io, CONFIG.CATASTROPHE_REVEAL_TIME, () => {
    startNewRound(room, io);
  });
}

function schedulePhaseTransition(room: Room, io: IOServer, delay: number, callback: () => void): void {
  if (room.gameState?.phaseTimer) {
    clearTimeout(room.gameState.phaseTimer);
  }
  if (room.gameState) {
    room.gameState.phaseEndTime = Date.now() + delay;
    room.gameState.phaseTimer = setTimeout(() => {
      if (room.gameState) {
        room.gameState.phaseTimer = null;
        room.gameState.phaseEndTime = null;
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

  room.gameState.phase = 'BUNKER_EXPLORE';

  // Reveal next bunker card
  if (room.gameState.revealedBunkerCount < room.gameState.bunkerCards.length) {
    room.gameState.revealedBunkerCount++;
  }

  broadcastState(room, io);

  // Auto-advance to card reveal
  schedulePhaseTransition(room, io, CONFIG.BUNKER_EXPLORE_TIME, () => {
    startRevealPhase(room, io);
  });
}

function startRevealPhase(room: Room, io: IOServer): void {
  if (!room.gameState) return;
  room.gameState.phase = 'ROUND_REVEAL';

  // Build turn order: alive players starting from the round starter
  const alivePlayers = getAlivePlayers(room);
  const aliveIds = alivePlayers.map(p => p.id);

  // Find the starter for this round: rotate through allPlayerIds
  const starterIdx = room.gameState.roundStarterIndex;
  // Find the next alive player from the rotation point
  let startFrom = 0;
  for (let i = 0; i < room.allPlayerIds.length; i++) {
    const idx = (starterIdx + i) % room.allPlayerIds.length;
    const pid = room.allPlayerIds[idx];
    const pos = aliveIds.indexOf(pid);
    if (pos !== -1) {
      startFrom = pos;
      break;
    }
  }

  room.gameState.turnOrder = [...aliveIds.slice(startFrom), ...aliveIds.slice(0, startFrom)];
  room.gameState.currentTurnIndex = 0;

  broadcastState(room, io);
}

export function revealAttribute(room: Room, playerId: string, attributeIndex: number | undefined, io: IOServer): boolean {
  if (!room.gameState || room.gameState.phase !== 'ROUND_REVEAL') return false;

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
  room.gameState.phase = 'ROUND_DISCUSSION';
  broadcastState(room, io);

  schedulePhaseTransition(room, io, CONFIG.DISCUSSION_TIME, () => {
    startVotePhase(room, io);
  });
}

function startVotePhase(room: Room, io: IOServer): void {
  if (!room.gameState) return;
  room.gameState.phase = 'ROUND_VOTE';
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
  if (room.gameState.phase !== 'ROUND_VOTE' && room.gameState.phase !== 'ROUND_VOTE_TIEBREAK') return false;

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
  if (room.gameState.phase === 'ROUND_VOTE_TIEBREAK') {
    if (!room.gameState.tiebreakCandidateIds.includes(targetId)) return false;
  }

  voter.hasVoted = true;
  voter.votedFor = targetId;
  room.gameState.votes.set(voterId, targetId);

  broadcastState(room, io);

  // Check if all voters have voted
  const voters = getVoters(room);
  const allVoted = voters.every(p => p.hasVoted);
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

  const isTiebreak = room.gameState.phase === 'ROUND_VOTE_TIEBREAK';
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
    const voter = room.players.get(voterId);
    const voteWeight = voter?.doubleVoteThisRound ? 2 : 1;
    voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + voteWeight);
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

  room.gameState.phase = 'ROUND_VOTE_TIEBREAK';
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
    room.gameState.phase = 'ROUND_RESULT';
    broadcastState(room, io);
    schedulePhaseTransition(room, io, CONFIG.RESULT_DISPLAY_TIME, () => {
      afterVoting(room, io);
    });
    return;
  }

  player.alive = false;
  room.gameState.eliminationOrder.push(playerId);
  room.gameState.lastEliminatedId = playerId;
  room.gameState.phase = 'ROUND_RESULT';

  io.to(room.code).emit('game:eliminated', {
    playerId,
    playerName: player.name,
  });

  broadcastState(room, io);

  // Reset round-specific flags
  for (const p of room.players.values()) {
    p.immuneThisRound = false;
    p.doubleVoteThisRound = false;
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

  // Advance round starter: next player after current starter
  room.gameState.roundStarterIndex = (room.gameState.roundStarterIndex + 1) % room.allPlayerIds.length;

  if (room.gameState.roundNumber >= CONFIG.TOTAL_ROUNDS) {
    // Game over after 5 rounds
    room.gameState.phase = 'GAME_OVER';
    broadcastState(room, io);
  } else {
    // Check if we still have enough players for elimination
    const alive = getAlivePlayers(room);
    if (alive.length <= room.gameState.bunkerCapacity) {
      room.gameState.phase = 'GAME_OVER';
      broadcastState(room, io);
    } else {
      startNewRound(room, io);
    }
  }
}

export function useAction(room: Room, playerId: string, targetPlayerId: string | undefined, io: IOServer): { success: boolean; result: string } {
  if (!room.gameState) return { success: false, result: 'Игра не запущена' };
  if (room.gameState.phase !== 'ROUND_REVEAL' && room.gameState.phase !== 'ROUND_DISCUSSION') {
    return { success: false, result: 'Сейчас нельзя использовать карту действия' };
  }

  const player = room.players.get(playerId);
  if (!player || !player.alive || !player.character) return { success: false, result: 'Игрок не найден' };
  if (player.actionUsed) return { success: false, result: 'Карта действия уже использована' };

  const action = player.character.actionCard;
  let target: Player | undefined;

  if (action.targetRequired) {
    if (!targetPlayerId) return { success: false, result: 'Требуется выбрать цель' };
    target = room.players.get(targetPlayerId);
    if (!target || !target.alive) return { success: false, result: 'Цель недоступна' };
  }

  player.actionUsed = true;
  player.character.actionUsed = true;
  let result = '';

  switch (action.id) {
    case 'swap_profession':
      if (target?.character && player.character) {
        const temp = player.character.attributes[0];
        player.character.attributes[0] = target.character.attributes[0];
        target.character.attributes[0] = temp;
        result = `${player.name} обменялся профессией с ${target.name}`;
      }
      break;

    case 'reveal_other':
      if (target) {
        const unrevealed = [];
        for (let i = 0; i < (target.character?.attributes.length || 0); i++) {
          if (!target.revealedIndices.includes(i)) unrevealed.push(i);
        }
        if (unrevealed.length > 0) {
          target.revealedIndices.push(unrevealed[0]);
          result = `${player.name} раскрыл характеристику игрока ${target.name}`;
        }
      }
      break;

    case 'double_vote':
      player.doubleVoteThisRound = true;
      result = `${player.name} получил двойной голос в этом раунде`;
      break;

    case 'immunity':
      player.immuneThisRound = true;
      result = `${player.name} получил иммунитет в этом раунде`;
      break;

    case 'peek':
      if (target?.character) {
        const unrevealed = [];
        for (let i = 0; i < target.character.attributes.length; i++) {
          if (!target.revealedIndices.includes(i)) unrevealed.push(i);
        }
        if (unrevealed.length > 0) {
          const attr = target.character.attributes[unrevealed[0]];
          result = `Вы подсмотрели: ${attr.label} — ${attr.value}`;
          const socket = io.sockets.sockets.get(player.socketId);
          if (socket) {
            socket.emit('game:actionResult', {
              playerId: player.id,
              actionTitle: action.title,
              result,
            });
          }
          io.to(room.code).emit('game:actionResult', {
            playerId: player.id,
            actionTitle: action.title,
            targetPlayerId: target.id,
            result: `${player.name} подсмотрел характеристику игрока ${target.name}`,
          });
          broadcastState(room, io);
          return { success: true, result };
        }
      }
      break;

    case 'swap_health':
      if (target?.character && player.character) {
        const playerHealthIdx = player.character.attributes.findIndex(a => a.type === 'health');
        const targetHealthIdx = target.character.attributes.findIndex(a => a.type === 'health');
        if (playerHealthIdx !== -1 && targetHealthIdx !== -1) {
          const temp = player.character.attributes[playerHealthIdx];
          player.character.attributes[playerHealthIdx] = target.character.attributes[targetHealthIdx];
          target.character.attributes[targetHealthIdx] = temp;
          result = `${player.name} обменялся здоровьем с ${target.name}`;
        }
      }
      break;

    case 'swap_baggage':
      if (target?.character && player.character) {
        const playerBagIdx = player.character.attributes.findIndex(a => a.type === 'baggage');
        const targetBagIdx = target.character.attributes.findIndex(a => a.type === 'baggage');
        if (playerBagIdx !== -1 && targetBagIdx !== -1) {
          const temp = player.character.attributes[playerBagIdx];
          player.character.attributes[playerBagIdx] = target.character.attributes[targetBagIdx];
          target.character.attributes[targetBagIdx] = temp;
          result = `${player.name} обменялся багажом с ${target.name}`;
        }
      }
      break;

    case 'hide_attribute':
      if (player.revealedIndices.length > 0) {
        player.revealedIndices.pop();
        result = `${player.name} скрыл одну из своих характеристик`;
      }
      break;

    case 'veto':
      result = `${player.name} сохранил право вето`;
      break;

    case 'fortune':
      if (player.character) {
        const usedProf = new Set<string>();
        const newChar = generateCharacter(usedProf);
        const unrevealed = player.character.attributes
          .map((_, i) => i)
          .filter(i => !player.revealedIndices.includes(i));
        if (unrevealed.length > 0) {
          const idx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
          player.character.attributes[idx] = newChar.attributes[idx % newChar.attributes.length];
          result = `${player.name} перегенерировал одну из своих характеристик`;
        }
      }
      break;

    default:
      result = `${player.name} использовал карту: ${action.title}`;
  }

  io.to(room.code).emit('game:actionResult', {
    playerId: player.id,
    actionTitle: action.title,
    targetPlayerId: target?.id,
    result,
  });

  if (target) {
    const targetSocket = io.sockets.sockets.get(target.socketId);
    if (targetSocket && target.character) {
      targetSocket.emit('game:character', target.character);
    }
  }
  const playerSocket = io.sockets.sockets.get(player.socketId);
  if (playerSocket && player.character) {
    playerSocket.emit('game:character', player.character);
  }

  broadcastState(room, io);
  return { success: true, result };
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
    player.actionUsed = false;
    player.immuneThisRound = false;
    player.doubleVoteThisRound = false;
  }

  broadcastState(room, io);
}

export function buildPublicState(room: Room): PublicGameState {
  const gs = room.gameState;
  const players: PlayerInfo[] = Array.from(room.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    ready: p.ready,
    connected: p.connected,
    alive: p.alive,
    revealedAttributes: p.revealedIndices.map(i => p.character?.attributes[i]).filter(Boolean) as Attribute[],
    isHost: p.id === room.hostId,
    isBot: p.isBot,
  }));

  // Count voters (alive + last eliminated)
  const voters = gs ? getVoters_fromState(room) : [];
  const votedCount = voters.filter(p => p.hasVoted).length;

  // Build vote results for ROUND_RESULT phase
  let voteResults: Record<string, number> | null = null;
  if (gs?.phase === 'ROUND_RESULT' || gs?.phase === 'GAME_OVER') {
    voteResults = {};
    for (const player of room.players.values()) {
      if (player.votedFor) {
        voteResults[player.votedFor] = (voteResults[player.votedFor] || 0) + (player.doubleVoteThisRound ? 2 : 1);
      }
    }
  }

  let eliminatedPlayerId: string | null = null;
  if (gs?.phase === 'ROUND_RESULT' && gs.eliminationOrder.length > 0) {
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
    phase: gs?.phase || 'LOBBY',
    roundNumber: gs?.roundNumber || 0,
    totalRounds: CONFIG.TOTAL_ROUNDS,
    catastrophe: gs?.catastrophe || null,
    revealedBunkerCards,
    bunkerCapacity: gs?.bunkerCapacity || 0,
    players,
    currentTurnPlayerId: gs?.phase === 'ROUND_REVEAL' ? gs.turnOrder[gs.currentTurnIndex] || null : null,
    votesCount: votedCount,
    totalVotesExpected: voters.length,
    voteResults,
    eliminatedPlayerId,
    votingSchedule: gs?.votingSchedule || [],
    currentVotingInRound: gs?.currentVotingInRound || 0,
    votingsInCurrentRound: gs?.votingSchedule[roundIdx] || 0,
    lastEliminatedPlayerId: gs?.lastEliminatedId || null,
    tiebreakCandidateIds: gs?.tiebreakCandidateIds?.length ? gs.tiebreakCandidateIds : null,
    phaseEndTime: gs?.phaseEndTime || null,
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
  io.to(room.code).emit('game:state', state);

  // Schedule bot actions after state broadcast
  scheduleBotActions(room, io);
}
