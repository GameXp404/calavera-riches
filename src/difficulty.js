import { DIFFICULTY_PROFILES, DEFAULT_DIFFICULTY, SYMBOLS } from './config.js';

const STORAGE_KEY = 'calavera_difficulty';

export const Difficulty = {
  current: DEFAULT_DIFFICULTY,

  load() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DIFFICULTY_PROFILES[saved]) this.current = saved;
    else this.current = DEFAULT_DIFFICULTY;
    return this.current;
  },

  set(level) {
    if (!DIFFICULTY_PROFILES[level]) return false;
    this.current = level;
    localStorage.setItem(STORAGE_KEY, level);
    return true;
  },

  getProfile() {
    return DIFFICULTY_PROFILES[this.current] || DIFFICULTY_PROFILES[DEFAULT_DIFFICULTY];
  },

  tierOf(symbolId) {
    const sym = SYMBOLS.find(s => s.id === symbolId);
    return sym ? sym.tier : 'low';
  },

  weightFor(symbolId, baseWeight) {
    const profile = this.getProfile();
    const tier = this.tierOf(symbolId);
    const mult = profile[tier] != null ? profile[tier] : 1;
    return baseWeight * mult;
  },
};
