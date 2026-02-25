import { Server } from 'socket.io';
import { ServerEvents, ClientEvents } from '../../shared/types.js';
import { Room, Player, getAlivePlayers } from './roomManager.js';
import { revealAttribute, castVote, useAction } from './gameEngine.js';
import { CONFIG } from './config.js';

type IOServer = Server<ClientEvents, ServerEvents>;

// Track pending bot timers per room to avoid duplicate actions
const pendingBotTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

function clearBotTimers(roomCode: string): void {
  const timers = pendingBotTimers.get(roomCode);
  if (timers) {
    for (const t of timers) clearTimeout(t);
  }
  pendingBotTimers.set(roomCode, []);
}

function addBotTimer(roomCode: string, timer: ReturnType<typeof setTimeout>): void {
  if (!pendingBotTimers.has(roomCode)) {
    pendingBotTimers.set(roomCode, []);
  }
  pendingBotTimers.get(roomCode)!.push(timer);
}

function randomDelay(): number {
  return CONFIG.BOT_ACTION_DELAY_MIN +
    Math.random() * (CONFIG.BOT_ACTION_DELAY_MAX - CONFIG.BOT_ACTION_DELAY_MIN);
}

function getAliveBots(room: Room): Player[] {
  return Array.from(room.players.values()).filter(p => p.isBot && p.alive);
}

function getAllBots(room: Room): Player[] {
  return Array.from(room.players.values()).filter(p => p.isBot);
}

export function scheduleBotActions(room: Room, io: IOServer): void {
  if (!room.gameState) return;

  // Clear any pending timers for this room
  clearBotTimers(room.code);

  const phase = room.gameState.phase;

  switch (phase) {
    case 'ROUND_REVEAL':
      scheduleBotReveal(room, io);
      break;
    case 'ROUND_VOTE':
    case 'ROUND_VOTE_TIEBREAK':
      scheduleBotVotes(room, io);
      break;
    case 'ROUND_DISCUSSION':
      scheduleBotActions_discussion(room, io);
      break;
  }
}

function scheduleBotReveal(room: Room, io: IOServer): void {
  if (!room.gameState) return;

  const currentPlayerId = room.gameState.turnOrder[room.gameState.currentTurnIndex];
  if (!currentPlayerId) return;

  const player = room.players.get(currentPlayerId);
  if (!player || !player.isBot || !player.alive) return;

  const timer = setTimeout(() => {
    if (!room.gameState || room.gameState.phase !== 'ROUND_REVEAL') return;

    // Pick a random unrevealed attribute (not the last one)
    const totalAttrs = player.character?.attributes.length || 0;
    const unrevealed: number[] = [];
    for (let i = 0; i < totalAttrs; i++) {
      if (!player.revealedIndices.includes(i)) unrevealed.push(i);
    }

    if (unrevealed.length <= 1) {
      // Can't reveal last card — skip by revealing with undefined
      revealAttribute(room, player.id, undefined, io);
      return;
    }

    const idx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    revealAttribute(room, player.id, idx, io);
  }, randomDelay());

  addBotTimer(room.code, timer);
}

function scheduleBotVotes(room: Room, io: IOServer): void {
  if (!room.gameState) return;

  const isTiebreak = room.gameState.phase === 'ROUND_VOTE_TIEBREAK';

  // Collect bot voters: alive bots + last eliminated bot
  const botVoters: Player[] = [];
  for (const player of room.players.values()) {
    if (!player.isBot) continue;
    if (player.hasVoted) continue;

    if (player.alive) {
      botVoters.push(player);
    } else if (player.id === room.gameState.lastEliminatedId) {
      botVoters.push(player);
    }
  }

  // Schedule staggered votes
  for (let i = 0; i < botVoters.length; i++) {
    const bot = botVoters[i];
    const delay = randomDelay() + i * 500; // Stagger by 500ms each

    const timer = setTimeout(() => {
      if (!room.gameState) return;
      if (room.gameState.phase !== 'ROUND_VOTE' && room.gameState.phase !== 'ROUND_VOTE_TIEBREAK') return;
      if (bot.hasVoted) return;

      // Pick target
      let candidates: Player[];
      if (isTiebreak && room.gameState.tiebreakCandidateIds.length > 0) {
        candidates = room.gameState.tiebreakCandidateIds
          .map(id => room.players.get(id))
          .filter((p): p is Player => !!p && p.alive && p.id !== bot.id);
      } else {
        candidates = getAlivePlayers(room).filter(p => p.id !== bot.id);
      }

      if (candidates.length === 0) return;

      const target = candidates[Math.floor(Math.random() * candidates.length)];
      castVote(room, bot.id, target.id, io);
    }, delay);

    addBotTimer(room.code, timer);
  }
}

function scheduleBotActions_discussion(room: Room, io: IOServer): void {
  if (!room.gameState) return;

  // 30% chance for each bot to use action during discussion
  const aliveBots = getAliveBots(room);

  for (const bot of aliveBots) {
    if (bot.actionUsed || !bot.character) continue;
    if (Math.random() > 0.3) continue; // 30% chance

    const delay = randomDelay() + 2000; // Extra delay for discussion

    const timer = setTimeout(() => {
      if (!room.gameState || room.gameState.phase !== 'ROUND_DISCUSSION') return;
      if (bot.actionUsed || !bot.character) return;

      const action = bot.character.actionCard;
      let targetId: string | undefined;

      if (action.targetRequired) {
        const alivePlayers = getAlivePlayers(room).filter(p => p.id !== bot.id);
        if (alivePlayers.length === 0) return;
        targetId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
      }

      useAction(room, bot.id, targetId, io);
    }, delay);

    addBotTimer(room.code, timer);
  }
}
