/** Server order is clockwise. Keep the viewer at the bottom and their next neighbour on the left. */
export function clockwiseOpponents<T extends { seatId: string }>(
  players: T[],
  viewerId: string | null,
) {
  const index = players.findIndex((player) => player.seatId === viewerId);
  return index < 0 ? players : [...players.slice(index + 1), ...players.slice(0, index)];
}
