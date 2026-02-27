// ============ Character System ============

export interface Attribute {
  type: AttributeType;
  label: string;
  value: string;
  detail?: string;
}

export type AttributeType = "profession" | "bio" | "health" | "hobby" | "baggage" | "fact";

export interface ActionCard {
  id: string;
  title: string;
  description: string;
  targetRequired: boolean;
}

export interface Character {
  attributes: Attribute[];
  actionCard: ActionCard;
}

// ============ Bunker Cards ============

export interface BunkerCard {
  title: string;
  description: string;
  image?: string;
}

export interface ThreatCard {
  title: string;
  description: string;
  image?: string;
}

// ============ Game State ============

export type GamePhase =
  | "LOBBY"
  | "CATASTROPHE_REVEAL"
  | "BUNKER_EXPLORE"
  | "ROUND_REVEAL"
  | "ROUND_DISCUSSION"
  | "ROUND_VOTE"
  | "ROUND_VOTE_TIEBREAK"
  | "ROUND_RESULT"
  | "GAME_OVER";

export interface Catastrophe {
  title: string;
  description: string;
  image?: string;
}

export interface FullAttribute extends Attribute {
  wasRevealed: boolean;
}

export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  alive: boolean;
  revealedAttributes: Attribute[];
  allAttributes?: FullAttribute[];
  actionCard?: ActionCard;
  actionCardRevealed: boolean;
  isHost: boolean;
  isBot: boolean;
}

export interface PublicGameState {
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  catastrophe: Catastrophe | null;
  revealedBunkerCards: BunkerCard[];
  totalBunkerCards: number;
  threatCard: ThreatCard | null;
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
  paused: boolean;
}

// ============ Socket Events ============

// Client -> Server
export interface ClientEvents {
  "room:create": (data: { playerName: string }) => void;
  "room:join": (data: { roomCode: string; playerName: string }) => void;
  "room:leave": () => void;
  "room:rejoin": (data: { roomCode: string; playerId: string }) => void;
  "player:ready": (data: { ready: boolean }) => void;
  "game:start": () => void;
  "game:revealAttribute": (data: { attributeIndex?: number }) => void;
  "game:revealActionCard": () => void;
  "admin:shuffleAll": (data: { attributeType: AttributeType | "action" }) => void;
  "admin:swapAttribute": (data: {
    player1Id: string;
    player2Id: string;
    attributeType: AttributeType | "action";
  }) => void;
  "admin:replaceAttribute": (data: {
    targetPlayerId: string;
    attributeType: AttributeType | "action";
  }) => void;
  "admin:removeBunkerCard": (data: { cardIndex: number }) => void;
  "admin:replaceBunkerCard": (data: { cardIndex: number }) => void;
  "admin:deleteAttribute": (data: { targetPlayerId: string; attributeType: AttributeType }) => void;
  "admin:forceRevealType": (data: { attributeType: AttributeType }) => void;
  "admin:pause": () => void;
  "admin:unpause": () => void;
  "vote:cast": (data: { targetPlayerId: string }) => void;
  "game:endGame": () => void;
  "game:playAgain": () => void;
  "room:addBot": () => void;
  "room:removeBot": (data: { playerId: string }) => void;
}

// Server -> Client
export interface ServerEvents {
  "room:created": (data: { roomCode: string; playerId: string }) => void;
  "room:joined": (data: { roomCode: string; playerId: string }) => void;
  "room:error": (data: { message: string }) => void;
  "game:state": (data: PublicGameState) => void;
  "game:character": (data: Character) => void;
  "game:eliminated": (data: { playerId: string; playerName: string }) => void;
}
