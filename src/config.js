export const GAME_VERSION = '1.0.0';
export const BUILD_DATE = '2026-05-19';

export const GAME_CONFIG = {
  REELS: 5,
  ROWS: 4,
  WAYS: 1024,
  BET_LEVELS: [
    400, 600, 800, 1200, 1400, 1600, 2000, 2200, 2400, 2600, 2800, 3000,
    4000, 5000, 6000, 8000, 10000, 15000, 20000, 30000, 50000, 75000,
    100000, 150000, 200000, 300000, 400000,
  ],
  DEFAULT_BET: 400,
  STARTING_BALANCE: 1000000,
  RTP: 0.965,
};

export const fmtMoney = (n) => Math.floor(n).toLocaleString('id-ID');

// Wild Bandito-aligned payouts (per the official paytable image).
// Values are "per way" multipliers of way-bet (totalBet / WAY_BET_DIVISOR).
// Divisor empirically tuned via headless sim (src/sim.js) for 96.5% RTP target.
//
// EMPIRICAL CALIBRATION (2M spin headless sim, 2026-05-22 FINAL):
//   divisor=132 -> RTP 96.61% [TARGET]  <-- CURRENT
//
// Calibration history:
//   1) divisor=148 -> 179% RTP    (initial guess, broken)
//   2) divisor=273 -> 96.5%       (gold-as-wild substitution, FS-gold off)
//   3) divisor=562 -> 96.3%       (FS-gold ON + gold-as-wild substitution)
//   4) divisor=149 -> 96.3%       (FS-gold ON, gold-as-own-symbol, ladder non-linear)
//   5) divisor=132 -> 96.6%       (LINEAR ladder, FS start ×1 per WB paytable)
//
// Final matches WB OFFICIAL paytable exactly:
//   - Normal: linear ladder 1-10, +1 per cascade, reset/spin
//   - FS: linear 1-50 sticky, start ×1, +1 per cascade
//   - Gold cells use own symbol identity (no wild substitution)
// Re-run "node src/sim.js 2000000 <divisor>" if reel weights / mechanic change.
export const WAY_BET_DIVISOR = 132;

// Match Wild Bandito reference EXACTLY: 11 symbols total
// (1 scatter + 1 wild [substitute only, no payout] + 4 themed + 5 letters)
// In WB, the Bandito character is the TOP-PAYING symbol (50/25/10), NOT the wild.
// Wild substitutes only, no direct payout.
// Order matches WB paytable layout (descending payout, displayed top→bottom).
export const SYMBOLS = [
  // Top high — match WB Bandito character (50/25/10). MARIACHI is our themed equivalent.
  { id: 'MARIACHI',label: 'Mariachi',     tier: 'high', payouts: { 3: 10, 4: 25, 5: 50 } },
  // High tier — match WB Guitar+roses (40/20/8) and Cocktail (30/15/6)
  { id: 'GUITAR',  label: 'Guitar',       tier: 'high', payouts: { 3: 8,  4: 20, 5: 40 } },
  { id: 'SKULL',   label: 'Sugar Skull',  tier: 'high', payouts: { 3: 6,  4: 15, 5: 30 } },
  // Mid tier — match WB Maracas
  { id: 'MARACAS', label: 'Maracas',      tier: 'mid',  payouts: { 3: 5,  4: 10, 5: 15 } },
  // Low tier (letters) — match WB 12/5/3 .. 6/3/1
  { id: 'ACE',     label: 'A',            tier: 'low',  payouts: { 3: 3, 4: 5,  5: 12 } },
  { id: 'KING',    label: 'K',            tier: 'low',  payouts: { 3: 3, 4: 5,  5: 12 } },
  { id: 'QUEEN',   label: 'Q',            tier: 'low',  payouts: { 3: 2, 4: 4,  5: 10 } },
  { id: 'JACK',    label: 'J',            tier: 'low',  payouts: { 3: 1, 4: 3,  5: 6  } },
  { id: 'TEN',     label: '10',           tier: 'low',  payouts: { 3: 1, 4: 3,  5: 6  } },
  // Wild — substitute only, NO direct payout per WB original behavior.
  { id: 'CATRINA', label: 'Catrina',      tier: 'wild', payouts: { 3: 0, 4: 0, 5: 0 }, isWild: true },
  // Scatter — triggers FS, no direct payout.
  { id: 'COFFIN',  label: 'Coffin',       tier: 'scatter', payouts: { 3: 0, 4: 0, 5: 0 }, isScatter: true },
];

export const DIFFICULTY_PROFILES = {
  EASY:      { label: 'EASY',      desc: 'Sering menang, scatter lebih sering, multiplier naik lebih cepat',     low: 0.7, mid: 1.2, high: 2.5, wild: 3.0, scatter: 2.5 },
  NORMAL:    { label: 'NORMAL',    desc: 'Setting standar — peluang win seimbang (default)',                       low: 1.0, mid: 1.0, high: 1.0, wild: 1.0, scatter: 1.0 },
  HARD:      { label: 'HARD',      desc: 'Win lebih jarang, simbol rendah dominan, scatter sulit muncul',         low: 1.4, mid: 0.8, high: 0.5, wild: 0.5, scatter: 0.6 },
  VERY_HARD: { label: 'VERY HARD', desc: 'Hanya untuk pemberani — wild & scatter sangat langka, win sedikit',     low: 1.8, mid: 0.7, high: 0.3, wild: 0.2, scatter: 0.3 },
};
export const DEFAULT_DIFFICULTY = 'NORMAL';

// Reel weights — 11 symbols matching WB reference (1 scatter + 1 wild + 4 themed + 5 letters).
// MARIACHI is the top-paying char (50/25/10, equivalent to WB Bandito), with low weight (rarity).
export const REEL_WEIGHTS = [
  { TEN:30, JACK:28, QUEEN:25, KING:22, ACE:18, MARACAS:9, GUITAR:6, SKULL:4, MARIACHI:2, COFFIN:2 },
  { TEN:28, JACK:26, QUEEN:23, KING:20, ACE:16, MARACAS:8, GUITAR:6, SKULL:4, MARIACHI:2, CATRINA:3, COFFIN:2 },
  { TEN:26, JACK:24, QUEEN:21, KING:18, ACE:14, MARACAS:7, GUITAR:5, SKULL:4, MARIACHI:2, CATRINA:4, COFFIN:2 },
  { TEN:28, JACK:26, QUEEN:23, KING:20, ACE:16, MARACAS:8, GUITAR:6, SKULL:4, MARIACHI:2, CATRINA:3, COFFIN:2 },
  { TEN:30, JACK:28, QUEEN:25, KING:22, ACE:18, MARACAS:9, GUITAR:6, SKULL:4, MARIACHI:2, COFFIN:2 },
];

// Match Wild Bandito (PG Soft) OFFICIAL PAYTABLE spec:
// - Base: LINEAR 1-10, step +1 (cap ×10) — per paytable badge showing ×5/×6/×7
//   consecutive, and rule "ditingkatkan sebanyak 1" per cascade win
// - FS:   LINEAR 1-50, step +1 (cap ×50)
export const MULTIPLIER_BASE_POOL = Array.from({ length: 10 }, (_, i) => i + 1); // [1,2,3,...,10]
export const MULTIPLIER_FREE_SPIN_POOL = Array.from({ length: 50 }, (_, i) => i + 1); // [1,2,3,...,50]
export const MULTIPLIER_FREE_SPIN_CAP = 50;

// Match WB official paytable: 12 base spins + 2 per extra scatter.
// startMult: paytable says nothing about special FS start mult, defaults to ×1
// (multiplier increments +1 per cascade win, same rule as base game).
export const FREE_SPIN_AWARDS = {
  3: { spins: 12, startMult: 1 },
  4: { spins: 14, startMult: 1 },
  5: { spins: 16, startMult: 1 },
};

// Retrigger awards same as initial trigger (WB convention).
export const FREE_SPIN_RETRIGGER = {
  3: 12,
  4: 14,
  5: 16,
};

export const WIN_TIERS = {
  NORMAL:    { min: 0,   duration: 800,  label: '' },
  BIG:       { min: 10,  duration: 2500, label: 'BIG WIN' },
  MEGA:      { min: 25,  duration: 4000, label: 'MEGA WIN' },
  EPIC:      { min: 50,  duration: 6000, label: 'EPIC WIN' },
  LEGENDARY: { min: 100, duration: 9000, label: 'LEGENDARY\nWIN' },
};

export const ASSET_PATH = {
  TEN:        'assets/img/ten.png',
  JACK:       'assets/img/jack.png',
  QUEEN:      'assets/img/queen.png',
  KING:       'assets/img/king.png',
  ACE:        'assets/img/ace.png',
  MARACAS:    'assets/img/maracas.png',
  GUITAR:     'assets/img/guitar.png',
  SKULL:      'assets/img/skull.png',
  MARIACHI:   'assets/img/mariachi.png',
  CATRINA:    'assets/img/catrina.png',
  COFFIN:     'assets/img/coffin.png',
  GOLD_FRAME: 'assets/img/gold_frame.png',
  // Win celebration label images (replace PIXI.Text per tier)
  WIN_BIG:       'assets/img/big%20win.png',     /* note: filename has space, encoded */
  WIN_MEGA:      'assets/img/mega-win.png',
  WIN_EPIC:      'assets/img/epic-win.png',
  WIN_LEGENDARY: 'assets/img/legendary-win.png',
};
