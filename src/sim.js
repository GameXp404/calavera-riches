// Calavera Riches — Headless RTP Simulator
// Usage: node src/sim.js [numSpins] [divisor]
// Defaults: 100,000 spins @ current WAY_BET_DIVISOR from config
//
// What it does:
//   1. Plays N spins headless (no UI), each with full cascade + gold-frame + FS logic
//   2. Tracks RTP, hit rate, win distribution, FS trigger rate
//   3. Auto-tunes WAY_BET_DIVISOR to hit target RTP 96.5% ±0.2%
//   4. Reports final number to use in config.js

import {
  GAME_CONFIG, REEL_WEIGHTS, SYMBOLS,
  MULTIPLIER_BASE_POOL, MULTIPLIER_FREE_SPIN_POOL,
  FREE_SPIN_AWARDS, FREE_SPIN_RETRIGGER, WAY_BET_DIVISOR,
} from './config.js';

const WILD_ID = 'CATRINA';
const SCATTER_ID = 'COFFIN';
const GOLD_FRAME_REELS = [1, 2, 3];
const GOLD_FRAME_CHANCE = 0.18;
const GOLD_FRAME_MAX = 3;
const REELS = GAME_CONFIG.REELS;
const ROWS = GAME_CONFIG.ROWS;

// Precompute weight tables (faster than re-iterating Object.entries each spin)
const WEIGHT_CACHE = REEL_WEIGHTS.map(w => {
  const entries = Object.entries(w);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return { entries, total };
});

const PAYABLES = SYMBOLS.filter(s => !s.isScatter && !s.isWild);

function randomSymbol(reelIdx) {
  const { entries, total } = WEIGHT_CACHE[reelIdx];
  let r = Math.random() * total;
  for (const [id, w] of entries) {
    r -= w;
    if (r <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

function countScatters(grid) {
  let n = 0;
  for (let r = 0; r < REELS; r++) {
    for (let row = 0; row < ROWS; row++) {
      if (grid[r][row] === SCATTER_ID) n++;
    }
  }
  return n;
}

function generateGrid() {
  const grid = [];
  for (let r = 0; r < REELS; r++) {
    const reel = [];
    let hasScatter = false;
    for (let i = 0; i < ROWS; i++) {
      let id = randomSymbol(r);
      let safety = 0;
      while (id === SCATTER_ID && hasScatter && safety++ < 20) id = randomSymbol(r);
      if (id === SCATTER_ID) hasScatter = true;
      reel.push(id);
    }
    grid.push(reel);
  }
  return grid;
}

function pickGoldCells(grid, isFreeSpin = false) {
  const golds = new Set();

  // FREE SPIN signature: middle reel (index 2) ALL cells gold (except wild/scatter)
  if (isFreeSpin) {
    for (let row = 0; row < ROWS; row++) {
      const id = grid[2][row];
      if (id === WILD_ID || id === SCATTER_ID) continue;
      golds.add(`2-${row}`);
    }
  }

  // Random gold on remaining reels: in FS only reel 1+3, in base all middle reels
  const reelsForRandom = isFreeSpin ? [1, 3] : GOLD_FRAME_REELS;
  const eligible = [];
  for (const r of reelsForRandom) {
    for (let row = 0; row < ROWS; row++) {
      const id = grid[r][row];
      if (id === WILD_ID || id === SCATTER_ID) continue;
      const key = `${r}-${row}`;
      if (golds.has(key)) continue;
      eligible.push(key);
    }
  }
  // Shuffle
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  let placed = 0;
  for (const key of eligible) {
    if (placed >= GOLD_FRAME_MAX) break;
    if (Math.random() < GOLD_FRAME_CHANCE) {
      golds.add(key);
      placed++;
    }
  }
  return golds;
}

function evaluateWays(grid, golds, bet, divisor) {
  // WB rule: gold cells do NOT substitute as wild for payout.
  // They use their OWN symbol identity. They only convert to wild AFTER
  // a win IF their own symbol was in a winning combo.
  // `golds` param kept for API compatibility but no longer used for substitution.
  let totalWin = 0;
  const winCells = new Set();
  for (const target of PAYABLES) {
    let chain = 0;
    let waysCount = 1;
    const cells = [];
    for (let i = 0; i < REELS; i++) {
      const reel = grid[i];
      const matches = [];
      for (let r = 0; r < ROWS; r++) {
        const id = reel[r];
        // Only actual symbol match OR real wild matches (no gold substitution).
        if (id === target.id || id === WILD_ID) matches.push(r);
      }
      if (matches.length === 0) break;
      chain++;
      waysCount *= matches.length;
      for (const row of matches) cells.push(`${i}-${row}`);
    }
    if (chain >= 3) {
      const mult = target.payouts[chain];
      if (mult > 0) {
        const wayBet = bet / divisor;
        totalWin += mult * waysCount * wayBet;
        for (const c of cells) winCells.add(c);
      }
    }
  }
  return { totalWin, winCells };
}

function cascadeOnce(grid, winCellSet, golds, isFreeSpin = false) {
  // Gold winning cells → become Wild in place (stay, no fall)
  // Non-gold winning cells → null → drop & refill
  const newGolds = new Set();
  for (const key of golds) {
    if (!winCellSet.has(key)) newGolds.add(key); // golds not in win stay marked
  }
  for (const key of winCellSet) {
    const [r, row] = key.split('-').map(Number);
    if (golds.has(key)) {
      grid[r][row] = WILD_ID;
    } else {
      grid[r][row] = null;
    }
  }
  for (let r = 0; r < REELS; r++) {
    const surviving = [];
    for (let row = 0; row < ROWS; row++) {
      if (grid[r][row] != null) surviving.push(grid[r][row]);
    }
    const numEmpty = ROWS - surviving.length;
    const newOnes = [];
    for (let i = 0; i < numEmpty; i++) {
      let id = randomSymbol(r);
      let safety = 0;
      while (id === SCATTER_ID && safety++ < 30) id = randomSymbol(r);
      if (id === SCATTER_ID) id = 'TEN';
      newOnes.push(id);
    }
    grid[r] = [...newOnes, ...surviving];
  }
  // FS signature: re-mark middle reel NEW symbols (top rows that just dropped in)
  // as gold so cascade continues to feed wild conversions on reel 2.
  if (isFreeSpin) {
    for (let row = 0; row < ROWS; row++) {
      const id = grid[2][row];
      if (id === WILD_ID || id === SCATTER_ID) continue;
      const key = `2-${row}`;
      // Only mark if not already gold (preserves convertedKeys behavior)
      if (!newGolds.has(key)) newGolds.add(key);
    }
  }
  return newGolds;
}

function bumpInPool(current, pool) {
  const idx = pool.indexOf(current);
  if (idx >= 0 && idx < pool.length - 1) return pool[idx + 1];
  return current;
}

function playOneSpin(bet, divisor, mode = 'BASE', startMult = 1) {
  const isFreeSpin = mode === 'FS';
  const grid = generateGrid();
  const scatterCount = countScatters(grid);
  let golds = pickGoldCells(grid, isFreeSpin);
  let mult = isFreeSpin ? startMult : 1;
  const pool = isFreeSpin ? MULTIPLIER_FREE_SPIN_POOL : MULTIPLIER_BASE_POOL;
  let totalWin = 0;
  let cascades = 0;
  for (let iter = 0; iter < 50; iter++) {
    const res = evaluateWays(grid, golds, bet, divisor);
    if (res.totalWin === 0 || res.winCells.size === 0) break;
    totalWin += res.totalWin * mult;
    golds = cascadeOnce(grid, res.winCells, golds, isFreeSpin);
    mult = bumpInPool(mult, pool);
    cascades++;
  }
  return { win: totalWin, endingMult: mult, scatterCount, cascades };
}

function runSimulation(numSpins, divisor, bet) {
  const stats = {
    totalBet: 0, totalWin: 0,
    hits: 0, bigWins: 0, megaWins: 0, epicWins: 0, legendaryWins: 0,
    fsTriggers: 0, fsTotalSpins: 0, fsTotalWin: 0,
    retriggers: 0, maxWin: 0, cascadeCounts: 0,
  };
  for (let i = 0; i < numSpins; i++) {
    stats.totalBet += bet;
    const base = playOneSpin(bet, divisor, 'BASE');
    let spinWin = base.win;
    stats.cascadeCounts += base.cascades;
    if (base.scatterCount >= 3) {
      stats.fsTriggers++;
      const award = FREE_SPIN_AWARDS[Math.min(5, base.scatterCount)] || FREE_SPIN_AWARDS[3];
      let spinsLeft = award.spins;
      let fsMult = award.startMult; // sticky multiplier (WB behavior)
      let fsWin = 0;
      let extraSpins = 0;
      while (spinsLeft > 0) {
        spinsLeft--;
        const fs = playOneSpin(bet, divisor, 'FS', fsMult);
        fsWin += fs.win;
        fsMult = fs.endingMult; // carry over (sticky)
        if (fs.scatterCount >= 3) {
          const extra = FREE_SPIN_RETRIGGER[Math.min(5, fs.scatterCount)] || FREE_SPIN_RETRIGGER[3];
          spinsLeft += extra;
          extraSpins += extra;
          stats.retriggers++;
        }
      }
      stats.fsTotalSpins += award.spins + extraSpins;
      stats.fsTotalWin += fsWin;
      spinWin += fsWin;
    }
    stats.totalWin += spinWin;
    if (spinWin > 0) stats.hits++;
    const ratio = spinWin / bet;
    if (ratio >= 100) stats.legendaryWins++;
    else if (ratio >= 50) stats.epicWins++;
    else if (ratio >= 25) stats.megaWins++;
    else if (ratio >= 10) stats.bigWins++;
    if (spinWin > stats.maxWin) stats.maxWin = spinWin;
  }
  return stats;
}

function printReport(stats, divisor, numSpins, durationMs) {
  const rtp = (stats.totalWin / stats.totalBet) * 100;
  const hitRate = (stats.hits / numSpins) * 100;
  const fsTriggerEvery = stats.fsTriggers > 0 ? numSpins / stats.fsTriggers : Infinity;
  const fmt = n => 'Rp ' + Math.floor(n).toLocaleString('id-ID');
  const status = (rtp >= 96.3 && rtp <= 96.7) ? '[OK TARGET]' : (rtp < 96.3 ? '[< rendah]' : '[> tinggi]');
  console.log('');
  console.log('========================================');
  console.log('  CALAVERA RICHES - SIMULATION REPORT');
  console.log('========================================');
  console.log(`  Divisor          : ${divisor}`);
  console.log(`  Total Spins      : ${numSpins.toLocaleString('id-ID')}`);
  console.log(`  Duration         : ${(durationMs / 1000).toFixed(1)}s`);
  console.log('----------------------------------------');
  console.log(`  Total Bet        : ${fmt(stats.totalBet)}`);
  console.log(`  Total Win        : ${fmt(stats.totalWin)}`);
  console.log(`  RTP              : ${rtp.toFixed(3)}%   ${status}`);
  console.log(`  Hit Rate         : ${hitRate.toFixed(2)}%`);
  console.log(`  Max Single Win   : ${fmt(stats.maxWin)}  (${(stats.maxWin / 400).toFixed(1)}x bet)`);
  console.log('----------------------------------------');
  console.log(`  Big Wins (10x+)        : ${stats.bigWins.toLocaleString('id-ID')}  (1 dari ${(numSpins / Math.max(1, stats.bigWins)).toFixed(0)} spin)`);
  console.log(`  Mega Wins (25x+)       : ${stats.megaWins.toLocaleString('id-ID')}  (1 dari ${(numSpins / Math.max(1, stats.megaWins)).toFixed(0)} spin)`);
  console.log(`  Epic Wins (50x+)       : ${stats.epicWins.toLocaleString('id-ID')}  (1 dari ${(numSpins / Math.max(1, stats.epicWins)).toFixed(0)} spin)`);
  console.log(`  Legendary (100x+)      : ${stats.legendaryWins.toLocaleString('id-ID')}  (1 dari ${(numSpins / Math.max(1, stats.legendaryWins)).toFixed(0)} spin)`);
  console.log('----------------------------------------');
  console.log(`  FS Triggers            : ${stats.fsTriggers}  (1 dari ${fsTriggerEvery.toFixed(0)} spin)`);
  console.log(`  FS Total Spins         : ${stats.fsTotalSpins.toLocaleString('id-ID')}`);
  console.log(`  FS Total Win           : ${fmt(stats.fsTotalWin)}  (${((stats.fsTotalWin / Math.max(1, stats.totalWin)) * 100).toFixed(1)}% dari total win)`);
  console.log(`  FS Retriggers          : ${stats.retriggers}`);
  console.log(`  Avg Cascades / Spin    : ${(stats.cascadeCounts / numSpins).toFixed(2)}`);
  console.log('========================================');
  return rtp;
}

function autoTune(targetRtp, tolerance, numSpins, bet) {
  let divisor = WAY_BET_DIVISOR;
  const tried = new Map();
  let bestDivisor = divisor;
  let bestDiff = Infinity;
  for (let iter = 0; iter < 6; iter++) {
    if (tried.has(divisor)) {
      divisor += (tried.get(divisor) > targetRtp ? 1 : -1);
      if (tried.has(divisor)) break;
    }
    console.log(`\n[Iter ${iter + 1}/6] divisor=${divisor}...`);
    const t0 = Date.now();
    const stats = runSimulation(numSpins, divisor, bet);
    const dt = Date.now() - t0;
    const rtp = printReport(stats, divisor, numSpins, dt);
    tried.set(divisor, rtp);
    const diff = Math.abs(rtp - targetRtp);
    if (diff < bestDiff) { bestDiff = diff; bestDivisor = divisor; }
    if (diff <= tolerance) {
      console.log(`\n[OK] TARGET REACHED at divisor=${divisor}, RTP=${rtp.toFixed(3)}%`);
      return { bestDivisor: divisor, bestRtp: rtp, allTried: tried };
    }
    // Newton-style adjustment: new = current * (rtp / target)
    let newDivisor = Math.round(divisor * (rtp / targetRtp));
    if (newDivisor === divisor) newDivisor += (rtp > targetRtp ? 1 : -1);
    divisor = newDivisor;
  }
  console.log(`\n[BEST] Best divisor found: ${bestDivisor} (RTP=${tried.get(bestDivisor).toFixed(3)}%, off by ${bestDiff.toFixed(3)}%)`);
  return { bestDivisor, bestRtp: tried.get(bestDivisor), allTried: tried };
}

// ===== MAIN =====
const args = process.argv.slice(2);
const NUM_SPINS = parseInt(args[0]) || 100000;
const FIXED_DIVISOR = args[1] ? parseInt(args[1]) : null;
const BET = GAME_CONFIG.DEFAULT_BET;
const TARGET_RTP = 96.5;
const TOLERANCE = 0.2;

console.log('========================================');
console.log('  STARTING CALAVERA RICHES SIMULATOR');
console.log('========================================');
console.log(`  Spins      : ${NUM_SPINS.toLocaleString('id-ID')}`);
console.log(`  Bet/spin   : Rp ${BET.toLocaleString('id-ID')}`);
console.log(`  Target RTP : ${TARGET_RTP}% +/-${TOLERANCE}%`);
console.log(`  Mode       : ${FIXED_DIVISOR ? 'SINGLE (divisor=' + FIXED_DIVISOR + ')' : 'AUTO-TUNE'}`);

if (FIXED_DIVISOR) {
  const t0 = Date.now();
  const stats = runSimulation(NUM_SPINS, FIXED_DIVISOR, BET);
  const dt = Date.now() - t0;
  printReport(stats, FIXED_DIVISOR, NUM_SPINS, dt);
} else {
  const result = autoTune(TARGET_RTP, TOLERANCE, NUM_SPINS, BET);
  console.log('\n========================================');
  console.log('  RECOMMENDED FINAL DIVISOR');
  console.log('========================================');
  console.log(`  WAY_BET_DIVISOR = ${result.bestDivisor}`);
  console.log(`  Measured RTP    = ${result.bestRtp.toFixed(3)}%`);
  console.log('');
  console.log('  All divisors tested:');
  for (const [d, r] of result.allTried) {
    console.log(`    divisor=${d}  ->  RTP=${r.toFixed(3)}%`);
  }
  console.log('========================================');
}
