import { MULTIPLIER_BASE_POOL, MULTIPLIER_FREE_SPIN_POOL, MULTIPLIER_FREE_SPIN_CAP } from './config.js';

export const Multiplier = {
  current: 1,
  isFreeSpin: false,

  reset() {
    // Always reset to ×1. Caller decides WHEN to call:
    //   Base game: called at START of every spin (WB behavior).
    //   Free Spin: NEVER called between FS spins (sticky multiplier per WB).
    //              endFreeSpin() resets at the very end of bonus.
    this.current = 1;
  },

  bumpBase() {
    const idx = MULTIPLIER_BASE_POOL.indexOf(this.current);
    if (idx >= 0 && idx < MULTIPLIER_BASE_POOL.length - 1) {
      this.current = MULTIPLIER_BASE_POOL[idx + 1];
    }
  },

  bumpFreeSpin() {
    const idx = MULTIPLIER_FREE_SPIN_POOL.indexOf(this.current);
    if (idx >= 0 && idx < MULTIPLIER_FREE_SPIN_POOL.length - 1) {
      this.current = MULTIPLIER_FREE_SPIN_POOL[idx + 1];
    }
  },

  startFreeSpin(startMult) {
    this.isFreeSpin = true;
    this.current = startMult;
  },

  endFreeSpin() {
    this.isFreeSpin = false;
    this.current = 1;
  },

  apply(winAmount) {
    return winAmount * this.current;
  },

  getNext() {
    const pool = this.isFreeSpin ? MULTIPLIER_FREE_SPIN_POOL : MULTIPLIER_BASE_POOL;
    const idx = pool.indexOf(this.current);
    if (idx >= 0 && idx < pool.length - 1) return pool[idx + 1];
    return this.current;
  },

  getPrev() {
    const pool = this.isFreeSpin ? MULTIPLIER_FREE_SPIN_POOL : MULTIPLIER_BASE_POOL;
    const idx = pool.indexOf(this.current);
    if (idx > 0) return pool[idx - 1];
    return pool[0];
  },
};
