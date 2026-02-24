// ============ Character System ============

export interface Attribute {
  type: AttributeType;
  label: string;
  value: string;
  detail?: string;
}

export type AttributeType =
  | 'profession'
  | 'bio'
  | 'health'
  | 'hobby'
  | 'baggage'
  | 'fact'
  | 'action';

export interface ActionCard {
  id: string;
  title: string;
  description: string;
  targetRequired: boolean;
}

export interface Character {
  attributes: Attribute[];
  actionCard: ActionCard;
  actionUsed: boolean;
}

// ============ Bunker Cards ============

export interface BunkerCard {
  title: string;
  description: string;
}

// ============ Game State ============

export type GamePhase =
  | 'LOBBY'
  | 'CATASTROPHE_REVEAL'
  | 'BUNKER_EXPLORE'
  | 'ROUND_REVEAL'
  | 'ROUND_DISCUSSION'
  | 'ROUND_VOTE'
  | 'ROUND_VOTE_TIEBREAK'
  | 'ROUND_RESULT'
  | 'GAME_OVER';

export interface Catastrophe {
  title: string;
  description: string;
}

export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  alive: boolean;
  revealedAttributes: Attribute[];
  isHost: boolean;
}

export interface PublicGameState {
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  catastrophe: Catastrophe | null;
  revealedBunkerCards: BunkerCard[];
  bunkerCapacity: number;
  players: PlayerInfo[];
  currentTurnPlayerId: string | null;
  votesCount: number;
  totalVotesExpected: number;
  voteResults: Record<string, number> | null;
  eliminatedPlayerId: string | null;
  votingSchedule: number[];
  currentVotingInRound: number;
  votingsInCurrentRound: number;
  lastEliminatedPlayerId: string | null;
  tiebreakCandidateIds: string[] | null;
  phaseEndTime: number | null;
}

// ============ Socket Events ============

// Client -> Server
export interface ClientEvents {
  'room:create': (data: { playerName: string }) => void;
  'room:join': (data: { roomCode: string; playerName: string }) => void;
  'room:leave': () => void;
  'room:rejoin': (data: { roomCode: string; playerId: string }) => void;
  'player:ready': (data: { ready: boolean }) => void;
  'game:start': () => void;
  'game:revealAttribute': (data: { attributeIndex?: number }) => void;
  'game:useAction': (data: { targetPlayerId?: string }) => void;
  'vote:cast': (data: { targetPlayerId: string }) => void;
  'game:playAgain': () => void;
}

// Server -> Client
export interface ServerEvents {
  'room:created': (data: { roomCode: string; playerId: string }) => void;
  'room:joined': (data: { roomCode: string; playerId: string }) => void;
  'room:error': (data: { message: string }) => void;
  'game:state': (data: PublicGameState) => void;
  'game:character': (data: Character) => void;
  'game:actionResult': (data: { playerId: string; actionTitle: string; targetPlayerId?: string; result: string }) => void;
  'game:eliminated': (data: { playerId: string; playerName: string }) => void;
}
