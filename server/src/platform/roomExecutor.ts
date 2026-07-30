const roomTails = new Map<string, Promise<void>>();

/**
 * Serialize every command submitted through the platform command contract.
 * A rejected command cannot poison the queue for commands that follow it.
 */
export function executeInRoom<T>(roomCode: string, operation: () => T | Promise<T>): Promise<T> {
  const previous = roomTails.get(roomCode) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  roomTails.set(roomCode, settled);
  void settled.finally(() => {
    if (roomTails.get(roomCode) === settled) roomTails.delete(roomCode);
  });
  return result;
}

export function disposeRoomExecutor(roomCode: string): void {
  roomTails.delete(roomCode);
}
