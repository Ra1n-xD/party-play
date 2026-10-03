const DAY_MS = 86_400_000;
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
export interface DailyReward {
  date: string;
  streak: number;
  coins: number;
}
/** Calendar days in Moscow, independent of the server or browser timezone. */
export function getMoscowDay(now = Date.now()) {
  return new Date(now + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}
export function nextMoscowMidnight(now = Date.now()) {
  return (Math.floor((now + MOSCOW_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - MOSCOW_OFFSET_MS;
}
export function nextDailyReward(
  previous: DailyReward | null | undefined,
  now = Date.now(),
): DailyReward | null {
  const date = getMoscowDay(now);
  if (previous && previous.date >= date) return null;
  const streak = previous?.date === getMoscowDay(now - DAY_MS) ? previous.streak + 1 : 1;
  return { date, streak, coins: streak };
}
