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
  DISCUSSION_TIME: 180000, // 3 мин
  VOTE_TIME: 60000, // 60 сек
  TIEBREAK_DEFENSE_TIME: 60000, // 1 мин
  RESULT_DISPLAY_TIME: 6000, // 6 сек
};

// По умолчанию PROD. Для теста: USE_TEST_TIMERS=true
const TIMERS = process.env.USE_TEST_TIMERS === "true" ? TEST_TIMERS : PROD_TIMERS;

export const CONFIG = {
  PORT: parseInt(process.env.PORT || "3001", 10),
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 16,
  ROOM_CODE_LENGTH: 6,
  TOTAL_ROUNDS: 5,
  ATTRIBUTE_COUNT: 6,
  ...TIMERS,
  RECONNECT_GRACE_PERIOD: 60000, // 60 сек
  BOT_ACTION_DELAY_MIN: 1000, // 1 сек
  BOT_ACTION_DELAY_MAX: 3000, // 3 сек
  MAX_PLAYER_NAME_LENGTH: 30, // Макс длина имени
  MAX_ROOMS: 500, // Макс количество комнат
  ROOM_INACTIVE_TTL: 30 * 60 * 1000, // 30 минут TTL для неактивных комнат
};
