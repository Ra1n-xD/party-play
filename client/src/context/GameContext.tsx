import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { socket } from "../socket";
import { PublicGameState, Character, AttributeType, ActionCard } from "../../../shared/types";

/** Client-side game state with local phaseEndTime computed from server's phaseRemainingMs */
export type ClientGameState = PublicGameState & { phaseEndTime: number | null };

interface GameContextType {
  connected: boolean;
  roomCode: string | null;
  playerId: string | null;
  gameState: ClientGameState | null;
  myCharacter: Character | null;
  error: string | null;
  createRoom: (name: string) => void;
  joinRoom: (code: string, name: string) => void;
  rejoinRoom: (code: string, pid: string) => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  revealAttribute: (attributeIndex?: number) => void;
  revealActionCard: () => void;
  castVote: (targetId: string) => void;
  endGame: () => void;
  playAgain: () => void;
  leaveRoom: () => void;
  clearError: () => void;
  addBot: () => void;
  removeBot: (playerId: string) => void;
  adminShuffleAll: (attributeType: AttributeType | "action") => void;
  adminSwapAttribute: (player1Id: string, player2Id: string, attributeType: AttributeType | "action") => void;
  adminReplaceAttribute: (targetPlayerId: string, attributeType: AttributeType | "action") => void;
  adminRemoveBunkerCard: (cardIndex: number) => void;
  adminReplaceBunkerCard: (cardIndex: number) => void;
  adminDeleteAttribute: (targetPlayerId: string, attributeType: AttributeType) => void;
  adminForceRevealType: (attributeType: AttributeType) => void;
  adminPause: () => void;
  adminUnpause: () => void;
  revealedActionCard: { playerName: string; actionCard: ActionCard } | null;
  pendingAdminOpen: boolean;
  consumePendingAdminOpen: () => void;
}

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [myCharacter, setMyCharacter] = useState<Character | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealedActionCard, setRevealedActionCard] = useState<{
    playerName: string;
    actionCard: ActionCard;
  } | null>(null);
  const [pendingAdminOpen, setPendingAdminOpen] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const actionCardTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("room:created", ({ roomCode: code, playerId: pid }) => {
      setRoomCode(code);
      setPlayerId(pid);
      sessionStorage.setItem("bunker_room", code);
      sessionStorage.setItem("bunker_player", pid);
    });

    socket.on("room:joined", ({ roomCode: code, playerId: pid }) => {
      setRoomCode(code);
      setPlayerId(pid);
      sessionStorage.setItem("bunker_room", code);
      sessionStorage.setItem("bunker_player", pid);
    });

    socket.on("room:error", ({ message }) => {
      setError(message);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setError(null), 4000);
    });

    socket.on("game:state", (state) => {
      // Convert server-relative remaining time to local absolute endTime
      // This avoids clock desync between server and client
      const phaseEndTime =
        state.phaseRemainingMs != null ? Date.now() + state.phaseRemainingMs : null;
      setGameState({ ...state, phaseEndTime });
    });

    socket.on("game:character", (character) => {
      setMyCharacter(character);
    });

    socket.on("game:actionCardRevealed", (data) => {
      setRevealedActionCard(data);
      if (actionCardTimerRef.current) clearTimeout(actionCardTimerRef.current);
      actionCardTimerRef.current = setTimeout(() => {
        setRevealedActionCard(null);
        setPendingAdminOpen(true);
      }, 10000);
    });

    // Try to rejoin on page reload
    const savedRoom = sessionStorage.getItem("bunker_room");
    const savedPlayer = sessionStorage.getItem("bunker_player");
    if (savedRoom && savedPlayer) {
      socket.emit("room:rejoin", { roomCode: savedRoom, playerId: savedPlayer });
    }

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("room:created");
      socket.off("room:joined");
      socket.off("room:error");
      socket.off("game:state");
      socket.off("game:character");
      socket.off("game:actionCardRevealed");
    };
  }, []);

  const createRoom = useCallback((name: string) => {
    socket.emit("room:create", { playerName: name });
  }, []);

  const joinRoom = useCallback((code: string, name: string) => {
    socket.emit("room:join", { roomCode: code, playerName: name });
  }, []);

  const rejoinRoom = useCallback((code: string, pid: string) => {
    socket.emit("room:rejoin", { roomCode: code, playerId: pid });
  }, []);

  const setReady = useCallback((ready: boolean) => {
    socket.emit("player:ready", { ready });
  }, []);

  const startGameFn = useCallback(() => {
    socket.emit("game:start");
  }, []);

  const revealAttributeFn = useCallback((attributeIndex?: number) => {
    socket.emit("game:revealAttribute", { attributeIndex });
  }, []);

  const revealActionCardFn = useCallback(() => {
    socket.emit("game:revealActionCard");
  }, []);

  const castVoteFn = useCallback((targetId: string) => {
    socket.emit("vote:cast", { targetPlayerId: targetId });
  }, []);

  const endGame = useCallback(() => {
    socket.emit("game:endGame");
  }, []);

  const playAgainFn = useCallback(() => {
    socket.emit("game:playAgain");
    setMyCharacter(null);
  }, []);

  const leaveRoom = useCallback(() => {
    socket.emit("room:leave");
    setRoomCode(null);
    setPlayerId(null);
    setGameState(null);
    setMyCharacter(null);
    sessionStorage.removeItem("bunker_room");
    sessionStorage.removeItem("bunker_player");
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const addBot = useCallback(() => {
    socket.emit("room:addBot");
  }, []);

  const removeBot = useCallback((botPlayerId: string) => {
    socket.emit("room:removeBot", { playerId: botPlayerId });
  }, []);

  const adminShuffleAllFn = useCallback((attributeType: AttributeType | "action") => {
    socket.emit("admin:shuffleAll", { attributeType });
  }, []);

  const adminSwapAttributeFn = useCallback(
    (player1Id: string, player2Id: string, attributeType: AttributeType | "action") => {
      socket.emit("admin:swapAttribute", { player1Id, player2Id, attributeType });
    },
    [],
  );

  const adminReplaceAttributeFn = useCallback(
    (targetPlayerId: string, attributeType: AttributeType | "action") => {
      socket.emit("admin:replaceAttribute", { targetPlayerId, attributeType });
    },
    [],
  );

  const adminRemoveBunkerCardFn = useCallback((cardIndex: number) => {
    socket.emit("admin:removeBunkerCard", { cardIndex });
  }, []);

  const adminReplaceBunkerCardFn = useCallback((cardIndex: number) => {
    socket.emit("admin:replaceBunkerCard", { cardIndex });
  }, []);

  const adminDeleteAttributeFn = useCallback(
    (targetPlayerId: string, attributeType: AttributeType) => {
      socket.emit("admin:deleteAttribute", { targetPlayerId, attributeType });
    },
    [],
  );

  const adminForceRevealTypeFn = useCallback((attributeType: AttributeType) => {
    socket.emit("admin:forceRevealType", { attributeType });
  }, []);

  const consumePendingAdminOpenFn = useCallback(() => {
    setPendingAdminOpen(false);
  }, []);

  const adminPauseFn = useCallback(() => {
    socket.emit("admin:pause");
  }, []);

  const adminUnpauseFn = useCallback(() => {
    socket.emit("admin:unpause");
  }, []);

  return (
    <GameContext.Provider
      value={{
        connected,
        roomCode,
        playerId,
        gameState,
        myCharacter,
        error,
        createRoom,
        joinRoom,
        rejoinRoom,
        setReady,
        startGame: startGameFn,
        revealAttribute: revealAttributeFn,
        revealActionCard: revealActionCardFn,
        castVote: castVoteFn,
        endGame,
        playAgain: playAgainFn,
        leaveRoom,
        clearError,
        addBot,
        removeBot,
        adminShuffleAll: adminShuffleAllFn,
        adminSwapAttribute: adminSwapAttributeFn,
        adminReplaceAttribute: adminReplaceAttributeFn,
        adminRemoveBunkerCard: adminRemoveBunkerCardFn,
        adminReplaceBunkerCard: adminReplaceBunkerCardFn,
        adminDeleteAttribute: adminDeleteAttributeFn,
        adminForceRevealType: adminForceRevealTypeFn,
        adminPause: adminPauseFn,
        adminUnpause: adminUnpauseFn,
        revealedActionCard,
        pendingAdminOpen,
        consumePendingAdminOpen: consumePendingAdminOpenFn,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
