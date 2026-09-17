import { useCallback, useEffect, useRef } from "react";
import {
  isAvatarLook,
  type AvatarLook,
  type AvatarLookEvent,
} from "../../../../../shared/platform/avatarLook";
import { socket } from "../../../socket";

export function useTablePresence(
  roomCode: string,
  canSend: boolean,
  onLook: (event: AvatarLookEvent) => void,
) {
  const current = useRef({ roomCode, canSend, onLook });
  current.current = { roomCode, canSend, onLook };
  useEffect(() => {
    const receive = (event: AvatarLookEvent) => {
      if (event.roomCode === current.current.roomCode && isAvatarLook(event))
        current.current.onLook(event);
    };
    socket.on("room:look", receive);
    return () => {
      socket.off("room:look", receive);
    };
  }, []);
  return useCallback((look: AvatarLook) => {
    if (current.current.canSend && socket.connected) socket.volatile.emit("room:look", look);
  }, []);
}
