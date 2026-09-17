import { useCallback, useEffect, useRef } from "react";
import {
  isAvatarLook,
  type AvatarLook,
  type AvatarLookEvent,
} from "../../../../../shared/platform/avatarLook";
import { socket } from "../../../socket";
import { isRoomReactionId, type RoomReactionEvent } from "../../../../../shared/platform/reactions";

export function useTablePresence(
  roomCode: string,
  canSend: boolean,
  onLook: (event: AvatarLookEvent) => void,
  onReaction?: (event: RoomReactionEvent) => void,
) {
  const current = useRef({ roomCode, canSend, onLook, onReaction });
  current.current = { roomCode, canSend, onLook, onReaction };
  useEffect(() => {
    const receive = (event: AvatarLookEvent) => {
      if (event.roomCode === current.current.roomCode && isAvatarLook(event))
        current.current.onLook(event);
    };
    socket.on("room:look", receive);
    const receiveReaction = (event: RoomReactionEvent) => {
      if (event.roomCode === current.current.roomCode && isRoomReactionId(event.reactionId))
        current.current.onReaction?.(event);
    };
    socket.on("room:reaction", receiveReaction);
    return () => {
      socket.off("room:look", receive);
      socket.off("room:reaction", receiveReaction);
    };
  }, []);
  return useCallback((look: AvatarLook) => {
    if (current.current.canSend && socket.connected) socket.volatile.emit("room:look", look);
  }, []);
}
