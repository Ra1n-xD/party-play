import type {
  ActionCard,
  Attribute,
  AttributeType,
  BunkerPrivateState,
  BunkerPublicState,
  BunkerVoterStatus,
  Character,
} from "../games/bunker/types.js";
import type { AnyGameEvent, GameId } from "./gameContract.js";
import type { RoomReactionEvent, RoomReactionId } from "./reactions.js";
import type { AnyRoomCommandEnvelope, AnyRoomSnapshot, RoomCommandResult, SeatId } from "./room.js";

export type HostChangeReason = "disconnect" | "manual" | "recovery";

export type ReconnectErrorCode =
  | "ROOM_NOT_FOUND"
  | "SEAT_CLOSED"
  | "INVALID_SESSION"
  | "SEAT_ALREADY_CONNECTED";

export interface ReconnectableSeat {
  playerId: SeatId;
  playerName: string;
}

export interface SeatClaimInfo {
  requestId: string;
  playerId: SeatId;
  playerName: string;
  claimantName: string;
}

export interface RoomCreatedPayload {
  roomCode: string;
  gameId: GameId;
  playerId: SeatId;
  sessionToken: string;
}

export interface RoomJoinedPayload extends RoomCreatedPayload {}

export interface SpectatorJoinedPayload {
  roomCode: string;
  gameId: GameId;
  spectatorId: string;
  sessionToken: string;
}

// Client -> Server
export interface ClientEvents {
  "room:create": (data: { gameId: GameId; playerName: string }) => void;
  "room:join": (data: { roomCode: string; playerName: string }) => void;
  "room:joinSpectator": (data: { roomCode: string; spectatorName: string }) => void;
  "room:leave": () => void;
  "room:rejoin": (data: { roomCode: string; playerId: string; sessionToken: string }) => void;
  "room:rejoinSpectator": (data: {
    roomCode: string;
    spectatorId: string;
    sessionToken: string;
  }) => void;
  "room:listReconnectableSeats": (data: { roomCode: string }) => void;
  "room:requestSeatClaim": (data: {
    roomCode: string;
    playerId: string;
    claimantName: string;
  }) => void;
  "room:cancelSeatClaim": (data: { requestId: string }) => void;
  "room:command": (data: AnyRoomCommandEnvelope) => void;
  "room:sendReaction": (data: { reactionId: RoomReactionId }) => void;

  // Legacy Bunker adapters. The active client routes these through room:command.
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
  "admin:skipDiscussion": () => void;
  "admin:revivePlayer": (data: { targetPlayerId: string }) => void;
  "admin:eliminatePlayer": (data: { targetPlayerId: string }) => void;
  "admin:resolveSeatClaim": (data: { requestId: string; approved: boolean }) => void;
  "admin:kickPlayer": (data: { targetPlayerId: string }) => void;
  "admin:transferHost": (data: { targetPlayerId: string }) => void;
  "admin:assignTemporaryBot": (data: { targetPlayerId: string }) => void;
  "vote:cast": (data: { targetPlayerId: string }) => void;
  "game:endGame": () => void;
  "game:playAgain": () => void;
  "room:addBot": () => void;
  "room:removeBot": (data: { playerId: string }) => void;
}

// Server -> Client
export interface ServerEvents {
  "room:created": (data: RoomCreatedPayload) => void;
  "room:joined": (data: RoomJoinedPayload) => void;
  "room:spectatorJoined": (data: SpectatorJoinedPayload) => void;
  "room:error": (data: { message: string }) => void;
  "room:reconnectableSeats": (data: { roomCode: string; seats: ReconnectableSeat[] }) => void;
  "room:seatClaimSubmitted": (data: { requestId: string }) => void;
  "room:seatClaimResolved": (data: {
    requestId: string;
    approved: boolean;
    message: string;
  }) => void;
  "room:hostChanged": (data: {
    hostId: string;
    hostName: string;
    reason: HostChangeReason;
  }) => void;
  "room:reconnectError": (data: {
    message: string;
    code: ReconnectErrorCode;
    terminal: boolean;
  }) => void;
  "room:kicked": (data: { message: string }) => void;
  "room:snapshot": (data: AnyRoomSnapshot) => void;
  "room:commandResult": (data: RoomCommandResult) => void;
  "room:reaction": (data: RoomReactionEvent) => void;
  "game:event": (data: AnyGameEvent) => void;
  "admin:seatClaimsUpdated": (data: { claims: SeatClaimInfo[] }) => void;

  // Legacy Bunker events kept while existing screens are adapted.
  "game:state": (data: BunkerPublicState) => void;
  "game:private": (data: BunkerPrivateState) => void;
  "game:character": (data: Character) => void;
  "game:voterStatus": (data: BunkerVoterStatus) => void;
  "game:eliminated": (data: { playerId: string; playerName: string }) => void;
  "game:actionCardRevealed": (data: { playerName: string; actionCard: ActionCard }) => void;
  "game:attributeRevealed": (data: { playerName: string; attribute: Attribute }) => void;
}

export type LegacyBunkerPublicState = BunkerPublicState;
