export const CONFIG = {
  PORT: 3001,
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 16,
  ROOM_CODE_LENGTH: 6,
  TOTAL_ROUNDS: 5,
  BUNKER_CARDS_COUNT: 5,
  ATTRIBUTE_COUNT: 6,
  CATASTROPHE_REVEAL_TIME: 8000,     // 8 sec
  BUNKER_EXPLORE_TIME: 5000,         // 5 sec
  DISCUSSION_TIME: 60000,            // 60 sec (1 min per rules)
  VOTE_TIME: 60000,                  // 60 sec
  TIEBREAK_DEFENSE_TIME: 30000,      // 30 sec per rules
  RESULT_DISPLAY_TIME: 6000,         // 6 sec
  RECONNECT_GRACE_PERIOD: 60000,     // 60 sec
  BOT_ACTION_DELAY_MIN: 1000,        // 1 sec min bot delay
  BOT_ACTION_DELAY_MAX: 3000,        // 3 sec max bot delay
};
