import type { DuelDirectory, DuelRequest } from "./duels.js";
import type { PetAction } from "./pet.js";
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
import type { AvatarLook, AvatarLookEvent } from "./avatarLook.js";
import type {
  AnyPublicRoomDirectorySnapshot,
  PublicRoomCountsSnapshot,
  PublicRoomErrorPayload,
  RoomVisibility,
} from "./publicRooms.js";
import type { ProjectStatsSnapshot } from "./projectStats.js";
import type { CaseOpening, ProfileReply, ProfileSnapshot } from "./cosmetics.js";
import type { CaseId } from "./cases.js";
import type { DailyReward, DailyRewardStatus } from "./dailyRewards.js";
import type { UpgradeReply, UpgradeRequest } from "./upgrades.js";
import type { CosmeticDrop } from "./dropFeed.js";
import type { LeaderboardQuery, LeaderboardSnapshot } from "./leaderboard.js";
import type {
  ProfileCredentials,
  ProfileRegistration,
  ProfileSession,
  ProfileAccountSnapshot,
  ProfileUpdate,
} from "./auth.js";
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
  "duels:unsubscribe": () => void;
  "duels:get": (
    data: { id?: string },
    reply: (result: ProfileReply<DuelDirectory>) => void,
  ) => void;
  "duels:command": (
    data: DuelRequest,
    reply: (result: ProfileReply<DuelDirectory>) => void,
  ) => void;
  "pet:action": (
    data: { action: PetAction; petId: string | null; day: string },
    reply: (result: ProfileReply<ProfileSnapshot>) => void,
  ) => void;
  "leaderboard:get": (
    query: LeaderboardQuery,
    reply: (result: ProfileReply<LeaderboardSnapshot>) => void,
  ) => void;
  "drops:subscribe": () => void;
  "drops:unsubscribe": () => void;
  "profile:login": (
    data: ProfileCredentials,
    reply: (result: ProfileReply<ProfileSession>) => void,
  ) => void;
  "profile:register": (
    data: ProfileRegistration,
    reply: (result: ProfileReply<ProfileSession>) => void,
  ) => void;
  "profile:session": (reply: (result: ProfileReply<ProfileAccountSnapshot | null>) => void) => void;
  "profile:update": (
    data: ProfileUpdate,
    reply: (result: ProfileReply<ProfileAccountSnapshot>) => void,
  ) => void;
  "profile:daily-status": (reply: (result: ProfileReply<DailyRewardStatus>) => void) => void;
  "profile:claim-daily": (
    data: { date: string },
    reply: (result: ProfileReply<{ profile: ProfileSnapshot; reward: DailyReward | null }>) => void,
  ) => void;
  "profile:logout": (reply: (result: ProfileReply<null>) => void) => void;
  "profile:equip": (
    data: { itemId: string },
    reply: (result: ProfileReply<ProfileSnapshot>) => void,
  ) => void;
  "profile:open-case": (
    data: { requestId: string; caseId?: CaseId },
    reply: (result: ProfileReply<{ profile: ProfileSnapshot; opening: CaseOpening }>) => void,
  ) => void;
  "profile:upgrade": (data: UpgradeRequest, reply: (result: UpgradeReply) => void) => void;
  "room:create": (data: {
    gameId?: GameId;
    playerName: string;
    visibility?: RoomVisibility;
  }) => void;
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
  "room:look": (data: AvatarLook) => void;
  "publicRooms:subscribe": (data: { gameId: GameId }) => void;
  "publicRooms:unsubscribe": (data: { gameId: GameId }) => void;
  "publicRooms:join": (data: { gameId: GameId; publicRoomId: string; playerName: string }) => void;
  "publicRooms:watch": (data: {
    gameId: GameId;
    publicRoomId: string;
    spectatorName: string;
  }) => void;
  "stats:subscribe": () => void;
  "stats:unsubscribe": () => void;

  // Legacy Bunker adapters. The active client routes these through room:command.
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
  "duels:snapshot": (snapshot: DuelDirectory) => void;
  "profile:account-snapshot": (data: ProfileAccountSnapshot) => void;
  "profile:expired": () => void;
  "drops:snapshot": (data: CosmeticDrop[]) => void;
  "profile:snapshot": (data: ProfileSnapshot) => void;
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
  "room:kicked": (data: { message: string; reason?: "deployment" }) => void;
  "room:snapshot": (data: AnyRoomSnapshot) => void;
  "room:commandResult": (data: RoomCommandResult) => void;
  "room:reaction": (data: RoomReactionEvent) => void;
  "room:look": (data: AvatarLookEvent) => void;
  "publicRooms:counts": (data: PublicRoomCountsSnapshot) => void;
  "publicRooms:directory": (data: AnyPublicRoomDirectorySnapshot) => void;
  "publicRooms:error": (data: PublicRoomErrorPayload) => void;
  "stats:snapshot": (data: ProjectStatsSnapshot) => void;
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
