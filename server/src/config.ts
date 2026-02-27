// ---- Тест (быстрые таймеры) ----
const TEST_TIMERS = {
  CATASTROPHE_REVEAL_TIME: 5000, // 5 сек
  BUNKER_EXPLORE_TIME: 5000, // 5 сек
  DISCUSSION_TIME: 5000, // 5 сек
  VOTE_TIME: 15000, // 15 сек
  TIEBREAK_DEFENSE_TIME: 5000, // 5 сек
  RESULT_DISPLAY_TIME: 5000, // 5 сек
};

// ---- Продакшн (нормальные таймеры) ----
const PROD_TIMERS = {
  CATASTROPHE_REVEAL_TIME: 8000, // 8 сек
  BUNKER_EXPLORE_TIME: 5000, // 5 сек
  DISCUSSION_TIME: 60000, // 60 сек
  VOTE_TIME: 60000, // 60 сек
  TIEBREAK_DEFENSE_TIME: 30000, // 30 сек
  RESULT_DISPLAY_TIME: 6000, // 6 сек
};

// Переключи: TEST_TIMERS для теста, PROD_TIMERS для деплоя
const TIMERS = TEST_TIMERS;

export const CONFIG = {
  PORT: 3001,
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 16,
  ROOM_CODE_LENGTH: 6,
  TOTAL_ROUNDS: 5,
  ATTRIBUTE_COUNT: 6,
  ...TIMERS,
  RECONNECT_GRACE_PERIOD: 60000, // 60 сек
  BOT_ACTION_DELAY_MIN: 1000, // 1 сек
  BOT_ACTION_DELAY_MAX: 3000, // 3 сек
};
