// Royal Knights — 5x3 slot game, 9 paylines, vanilla JS.
// Server-authoritative balance via POST /api/player/spin-record (same endpoint Calavera uses).
// Optimistic local update during spin animation; final state taken from server response.

// ============================================================
// CONFIG
// ============================================================
const REEL_COUNT = 5;
const ROW_COUNT = 3;
const BET_TIERS = [100, 500, 1000, 5000, 10000];

// Symbols (index = id used in reel strips + payouts)
const SYM = {
  SWORD:   { id: 0, ch: '🗡️', name: 'Sword' },
  SHIELD:  { id: 1, ch: '🛡️', name: 'Shield' },
  CROSS:   { id: 2, ch: '⚔️', name: 'Swords' },
  BOW:     { id: 3, ch: '🏹', name: 'Bow' },
  CROWN:   { id: 4, ch: '👑', name: 'Crown' },
  CASTLE:  { id: 5, ch: '🏰', name: 'Castle' },
  DRAGON:  { id: 6, ch: '🐉', name: 'Dragon' },
  WIZARD:  { id: 7, ch: '🧙', name: 'Wizard' },
  WILD:    { id: 8, ch: '🌟', name: 'Wild' },
  SCATTER: { id: 9, ch: '💰', name: 'Scatter' },
};
const SYM_BY_ID = Object.values(SYM).reduce((m, s) => (m[s.id] = s, m), {});

// Paytable: multiplier (× bet/9 per line). [3of, 4of, 5of]
const PAYOUT = {
  0: [0.5, 1, 2],    // Sword
  1: [0.5, 1, 2],    // Shield
  2: [1, 2, 5],      // Crossed swords
  3: [1, 2, 5],      // Bow
  4: [2, 5, 15],     // Crown
  5: [3, 8, 25],     // Castle
  6: [5, 15, 50],    // Dragon
  7: [5, 15, 50],    // Wizard
};
// Scatter pays on total bet, not per line.
const SCATTER_PAY = { 3: 10, 4: 25, 5: 100 };
const SCATTER_FREE_SPINS_AT_5 = 10;

// 9 paylines as row indices per reel.
// 0=top, 1=middle, 2=bottom
const PAYLINES = [
  [1, 1, 1, 1, 1], // 1: middle straight
  [0, 0, 0, 0, 0], // 2: top straight
  [2, 2, 2, 2, 2], // 3: bottom straight
  [0, 1, 2, 1, 0], // 4: V
  [2, 1, 0, 1, 2], // 5: ^
  [0, 0, 1, 0, 0], // 6: top-dip
  [2, 2, 1, 2, 2], // 7: bottom-bump
  [1, 0, 0, 0, 1], // 8: arch up
  [1, 2, 2, 2, 1], // 9: arch down
];

// Reel strips (weighted distribution per reel — low symbols common, high rare).
function makeStrip(reelIdx) {
  const base = [
    ...Array(8).fill(SYM.SWORD.id),
    ...Array(7).fill(SYM.SHIELD.id),
    ...Array(5).fill(SYM.CROSS.id),
    ...Array(5).fill(SYM.BOW.id),
    ...Array(3).fill(SYM.CROWN.id),
    ...Array(2).fill(SYM.CASTLE.id),
    ...Array(1).fill(SYM.DRAGON.id),
    ...Array(1).fill(SYM.WIZARD.id),
  ];
  // Wild on reels 1, 2, 3 (middle reels) — classic slot design
  if (reelIdx >= 1 && reelIdx <= 3) base.push(SYM.WILD.id);
  // Scatter on every reel, ~1 per strip
  base.push(SYM.SCATTER.id);
  return shuffle(base);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const REELS = Array.from({ length: REEL_COUNT }, (_, i) => makeStrip(i));

// ============================================================
// STATE
// ============================================================
const state = {
  balance: 0,
  betIdx: 2, // index into BET_TIERS — default 1000
  username: 'Guest',
  token: null,
  spinning: false,
  freeSpins: 0,
  autoSpinsLeft: 0,
  turbo: false,
  grid: Array.from({ length: REEL_COUNT }, () => Array(ROW_COUNT).fill(SYM.SWORD.id)),
};

function bet() { return BET_TIERS[state.betIdx]; }

// ============================================================
// DOM
// ============================================================
const $ = (id) => document.getElementById(id);
const reelEls = Array.from(document.querySelectorAll('.reel'));
const stripEls = reelEls.map(r => r.querySelector('.strip'));

// ============================================================
// SESSION / API
// ============================================================
function loadSession() {
  try {
    state.token = localStorage.getItem('calavera_token') || null;
    state.username = localStorage.getItem('calavera_user') || 'Guest';
  } catch (e) {}
  $('user-name').textContent = state.username;
  if (!state.token) {
    toast('Belum login — arahkan ke lobby…');
    setTimeout(() => { window.location.href = '/lobby'; }, 1500);
    return false;
  }
  return true;
}

async function fetchBalance() {
  if (!state.token) return;
  try {
    const res = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + state.token } });
    if (!res.ok) throw new Error('http_' + res.status);
    const data = await res.json();
    if (data?.user?.balance != null) {
      state.balance = data.user.balance;
      updateBalance();
    }
  } catch (e) {
    console.warn('[balance] fetch failed:', e);
  }
}

async function recordSpin(betAmount, winAmount, tier, scatterCount, isFreeSpinSpin) {
  if (!state.token) return null;
  try {
    const res = await fetch('/api/player/spin-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.token },
      body: JSON.stringify({
        bet: betAmount,
        win: winAmount,
        tier: tier || null,
        scatterCount: scatterCount || 0,
        isFreeSpinSpin: !!isFreeSpinSpin,
        game: 'royal_knights',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[spin-record] failed', res.status, err);
      toast('Sync error: ' + (err.error || res.status));
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn('[spin-record] network error:', e);
    return null;
  }
}

// ============================================================
// RENDER
// ============================================================
function symbolNode(symId, extraClass = '') {
  const s = SYM_BY_ID[symId];
  const div = document.createElement('div');
  div.className = 'symbol' + (extraClass ? ' ' + extraClass : '');
  div.textContent = s.ch;
  div.dataset.symId = symId;
  return div;
}

// Pre-fill each reel with a long strip (3 visible + extras for scroll animation).
function buildInitialStrips() {
  for (let r = 0; r < REEL_COUNT; r++) {
    const reelStrip = REELS[r];
    const frag = document.createDocumentFragment();
    // Use first 3 symbols of shuffled strip as initial visible state.
    for (let i = 0; i < 3; i++) {
      frag.appendChild(symbolNode(reelStrip[i % reelStrip.length]));
      state.grid[r][i] = reelStrip[i % reelStrip.length];
    }
    stripEls[r].innerHTML = '';
    stripEls[r].appendChild(frag);
    stripEls[r].style.transform = 'translateY(0px)';
  }
}

function updateBalance() {
  $('balance-val').textContent = state.balance.toLocaleString('id-ID');
}
function updateBet() {
  $('bet-val').textContent = bet().toLocaleString('id-ID');
  $('bet-dec').disabled = state.betIdx === 0 || state.spinning;
  $('bet-inc').disabled = state.betIdx === BET_TIERS.length - 1 || state.spinning;
}
function updateWin(w) { $('win-val').textContent = (w || 0).toLocaleString('id-ID'); }
function updateFreeSpins(n) {
  $('free-spins-val').textContent = n || 0;
  $('free-spins-val').style.color = n > 0 ? '#ff9a4a' : '';
}
function setSpinButtonState() {
  const btn = $('spin-btn');
  btn.disabled = state.spinning || (state.balance < bet() && state.freeSpins === 0);
  btn.querySelector('.spin-text').textContent = state.freeSpins > 0 ? 'FREE!' : 'SPIN';
}

// ============================================================
// SPIN ANIMATION
// ============================================================
function pickTargetSymbols(reelIdx, count) {
  // Pick `count` random symbols from this reel's strip for the spin landing.
  const strip = REELS[reelIdx];
  const out = [];
  for (let i = 0; i < count; i++) out.push(strip[Math.floor(Math.random() * strip.length)]);
  return out;
}

async function animateReel(reelIdx, landingSymbols, durationMs, extraSymbols) {
  const strip = stripEls[reelIdx];
  // Build a long scroll: extra random symbols above, then 3 landing symbols at bottom.
  const filler = [];
  for (let i = 0; i < extraSymbols; i++) {
    filler.push(REELS[reelIdx][Math.floor(Math.random() * REELS[reelIdx].length)]);
  }
  const fullSeq = [...filler, ...landingSymbols];
  strip.innerHTML = '';
  fullSeq.forEach(id => strip.appendChild(symbolNode(id)));

  // Strip starts shifted up so all extra symbols are visible above the window.
  const reelHeight = strip.parentElement.clientHeight;
  const totalSymbols = fullSeq.length;
  const symbolHeight = reelHeight / 3;
  const startOffset = -(totalSymbols - 3) * symbolHeight;
  strip.style.transition = 'none';
  strip.style.transform = `translateY(${startOffset}px)`;

  // Force layout flush so the start transform is applied before the transition.
  // (Reading offsetHeight is the standard "force reflow" trick.)
  void strip.offsetHeight;

  // Then animate to translateY(0): the landing 3 symbols slide into the visible window.
  strip.style.transition = `transform ${durationMs}ms cubic-bezier(0.18, 0.78, 0.32, 1.01)`;
  strip.style.transform = 'translateY(0px)';

  return new Promise(resolve => {
    let resolved = false;
    const done = () => { if (resolved) return; resolved = true; strip.removeEventListener('transitionend', done); resolve(); };
    strip.addEventListener('transitionend', done, { once: true });
    setTimeout(done, durationMs + 100);
  });
}

// ============================================================
// WIN EVALUATION
// ============================================================
function evaluateGrid() {
  // grid is column-major: state.grid[reel][row]
  const wins = [];
  let totalWin = 0;
  const lineBet = Math.floor(bet() / PAYLINES.length);

  PAYLINES.forEach((line, idx) => {
    const symbols = line.map((row, reel) => state.grid[reel][row]);
    // Find the first non-Wild symbol — that determines the pay symbol.
    // (Wilds at the start substitute for the next paying symbol.)
    let paySym = -1;
    let matchLen = 0;
    for (let i = 0; i < symbols.length; i++) {
      const s = symbols[i];
      if (s === SYM.SCATTER.id) break; // scatter doesn't pay on lines
      if (paySym === -1) {
        // First symbol — if Wild, we tentatively keep looking but treat as wild
        if (s === SYM.WILD.id) { matchLen = 1; continue; }
        paySym = s; matchLen = 1;
      } else if (s === paySym || s === SYM.WILD.id) {
        matchLen++;
      } else {
        break;
      }
    }
    // If line is ALL wilds, pay as highest symbol (Dragon)
    if (paySym === -1 && matchLen >= 3) paySym = SYM.DRAGON.id;

    if (matchLen >= 3 && paySym !== -1 && PAYOUT[paySym]) {
      const mult = PAYOUT[paySym][matchLen - 3];
      if (mult > 0) {
        const winAmount = Math.floor(mult * lineBet);
        if (winAmount > 0) {
          totalWin += winAmount;
          wins.push({ lineIdx: idx, paySym, matchLen, winAmount, cells: line.slice(0, matchLen).map((row, reel) => [reel, row]) });
        }
      }
    }
  });

  // Scatter (pays anywhere)
  let scatterCount = 0;
  const scatterCells = [];
  for (let r = 0; r < REEL_COUNT; r++) {
    for (let row = 0; row < ROW_COUNT; row++) {
      if (state.grid[r][row] === SYM.SCATTER.id) { scatterCount++; scatterCells.push([r, row]); }
    }
  }
  let scatterWin = 0;
  let freeSpinsAwarded = 0;
  if (SCATTER_PAY[scatterCount]) {
    scatterWin = Math.floor(SCATTER_PAY[scatterCount] * bet());
    totalWin += scatterWin;
    if (scatterCount >= 5) freeSpinsAwarded = SCATTER_FREE_SPINS_AT_5;
  }
  if (scatterCount >= 3) {
    wins.push({ scatter: true, scatterCount, winAmount: scatterWin, cells: scatterCells });
  }

  // Determine tier name (for big-win popup + server log)
  let tier = '';
  const betAmount = bet();
  if (totalWin >= betAmount * 50) tier = 'LEGENDARY';
  else if (totalWin >= betAmount * 20) tier = 'EPIC';
  else if (totalWin >= betAmount * 10) tier = 'MEGA';
  else if (totalWin >= betAmount * 5) tier = 'BIG';

  return { wins, totalWin, scatterCount, freeSpinsAwarded, tier };
}

// ============================================================
// WIN PRESENTATION (highlight cells + paylines)
// ============================================================
function clearWinHighlights() {
  document.querySelectorAll('.symbol').forEach(s => { s.classList.remove('win', 'dim'); });
  const overlay = $('payline-overlay');
  overlay.innerHTML = '';
}

function highlightWins(wins) {
  // Dim everything first, then re-light winners.
  document.querySelectorAll('.symbol').forEach(s => s.classList.add('dim'));
  const winnerCells = new Set();
  wins.forEach(w => w.cells.forEach(([r, row]) => winnerCells.add(`${r},${row}`)));

  for (let r = 0; r < REEL_COUNT; r++) {
    const symbols = stripEls[r].querySelectorAll('.symbol');
    for (let row = 0; row < ROW_COUNT; row++) {
      if (winnerCells.has(`${r},${row}`)) {
        symbols[row].classList.remove('dim');
        symbols[row].classList.add('win');
      }
    }
  }
  drawPaylines(wins);
}

function drawPaylines(wins) {
  const overlay = $('payline-overlay');
  overlay.innerHTML = '';
  const colors = ['#ffd700', '#ff5050', '#50d8ff', '#a050ff', '#50ff8a', '#ffa050', '#ff50d0', '#d0ff50', '#5070ff'];
  // viewBox is 500x300; columns at 50,150,250,350,450 (10% pad), rows at 50,150,250.
  const colX = [50, 150, 250, 350, 450];
  const rowY = [50, 150, 250];
  wins.forEach(w => {
    if (w.scatter) return; // scatter has no line
    const c = colors[w.lineIdx % colors.length];
    const line = PAYLINES[w.lineIdx];
    const pts = line.slice(0, w.matchLen).map((row, reel) => `${colX[reel]},${rowY[row]}`).join(' ');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', pts);
    poly.setAttribute('class', 'pl-line');
    poly.setAttribute('stroke', c);
    overlay.appendChild(poly);
  });
}

// ============================================================
// SPIN ORCHESTRATION
// ============================================================
async function spin() {
  if (state.spinning) return;
  const isFreeSpin = state.freeSpins > 0;
  const cost = isFreeSpin ? 0 : bet();

  if (!isFreeSpin && state.balance < cost) {
    toast('Saldo tidak cukup');
    return;
  }

  state.spinning = true;
  clearWinHighlights();
  updateWin(0);
  setSpinButtonState();
  updateBet();

  // Optimistic local balance update (server will overwrite when sync returns).
  if (!isFreeSpin) {
    state.balance -= cost;
    updateBalance();
  }

  // Generate target grid up-front (column-major).
  const newGrid = [];
  for (let r = 0; r < REEL_COUNT; r++) {
    newGrid.push(pickTargetSymbols(r, 3));
  }
  state.grid = newGrid;

  // Animate reels with stagger.
  const baseDuration = state.turbo ? 380 : 850;
  const stagger = state.turbo ? 80 : 180;
  const extraSymbols = state.turbo ? 8 : 16;
  const promises = [];
  for (let r = 0; r < REEL_COUNT; r++) {
    promises.push(
      new Promise(resolve => setTimeout(resolve, r * stagger))
        .then(() => animateReel(r, newGrid[r], baseDuration + r * 60, extraSymbols))
    );
  }
  await Promise.all(promises);

  // Evaluate
  const result = evaluateGrid();

  // Apply win
  if (result.totalWin > 0) {
    state.balance += result.totalWin;
    updateBalance();
    updateWin(result.totalWin);
    highlightWins(result.wins);
  }
  if (result.freeSpinsAwarded > 0) {
    state.freeSpins += result.freeSpinsAwarded;
    updateFreeSpins(state.freeSpins);
    toast(`🌟 ${result.scatterCount} SCATTER! +${result.freeSpinsAwarded} Free Spins`);
  } else if (result.scatterCount >= 3) {
    toast(`💰 ${result.scatterCount} Scatter! +${result.wins.find(w => w.scatter).winAmount.toLocaleString('id-ID')}`);
  }

  if (isFreeSpin) {
    state.freeSpins--;
    updateFreeSpins(state.freeSpins);
  }

  // Show big-win popup for higher tiers
  if (result.tier && ['MEGA', 'EPIC', 'LEGENDARY'].includes(result.tier) && result.totalWin > 0) {
    await showBigWinPopup(result.tier, result.totalWin);
  }

  // Sync to server (authoritative)
  const serverResp = await recordSpin(cost, result.totalWin, result.tier, result.scatterCount, isFreeSpin);
  if (serverResp?.balance != null) {
    state.balance = serverResp.balance;
    updateBalance();
  }

  state.spinning = false;
  setSpinButtonState();
  updateBet();

  // Continue free spins or auto-spin
  if (state.freeSpins > 0) {
    await wait(state.turbo ? 180 : 600);
    spin();
  } else if (state.autoSpinsLeft > 0) {
    state.autoSpinsLeft--;
    updateAutoButton();
    if (state.balance >= bet()) {
      await wait(state.turbo ? 180 : 400);
      spin();
    } else {
      state.autoSpinsLeft = 0;
      updateAutoButton();
      toast('Auto-spin berhenti — saldo habis');
    }
  }
}

// ============================================================
// UI HELPERS
// ============================================================
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function showBigWinPopup(tier, amount) {
  return new Promise(resolve => {
    $('big-win-title').textContent = tier + ' WIN!';
    $('big-win-amount').textContent = amount.toLocaleString('id-ID');
    const popup = $('big-win-popup');
    popup.style.display = 'flex';
    const closeBtn = $('close-big-win');
    const onClose = () => {
      popup.style.display = 'none';
      closeBtn.removeEventListener('click', onClose);
      resolve();
    };
    closeBtn.addEventListener('click', onClose);
    // Auto-dismiss after 4s in case user doesn't click
    setTimeout(onClose, 4500);
  });
}

function updateAutoButton() {
  const btn = $('auto-btn');
  if (state.autoSpinsLeft > 0) {
    btn.textContent = `STOP (${state.autoSpinsLeft})`;
    btn.classList.add('active');
  } else {
    btn.textContent = 'AUTO 10×';
    btn.classList.remove('active');
  }
}

// ============================================================
// EVENT BINDINGS
// ============================================================
function bindEvents() {
  $('back-btn').addEventListener('click', () => { window.location.href = '/lobby'; });

  $('spin-btn').addEventListener('click', () => spin());
  $('bet-dec').addEventListener('click', () => {
    if (state.spinning || state.betIdx === 0) return;
    state.betIdx--; updateBet(); setSpinButtonState();
  });
  $('bet-inc').addEventListener('click', () => {
    if (state.spinning || state.betIdx === BET_TIERS.length - 1) return;
    state.betIdx++; updateBet(); setSpinButtonState();
  });
  $('turbo-btn').addEventListener('click', () => {
    state.turbo = !state.turbo;
    $('turbo-btn').classList.toggle('active', state.turbo);
  });
  $('auto-btn').addEventListener('click', () => {
    if (state.spinning) return;
    if (state.autoSpinsLeft > 0) {
      state.autoSpinsLeft = 0;
      updateAutoButton();
    } else {
      state.autoSpinsLeft = 10;
      updateAutoButton();
      spin();
    }
  });
  $('show-paytable').addEventListener('click', () => { $('paytable-modal').style.display = 'flex'; });
  $('close-paytable').addEventListener('click', () => { $('paytable-modal').style.display = 'none'; });
  $('paytable-modal').addEventListener('click', (e) => { if (e.target.id === 'paytable-modal') e.currentTarget.style.display = 'none'; });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !state.spinning) { e.preventDefault(); spin(); }
  });

  // Refresh balance when tab regains focus (covers spins in other tabs / lobby coin updates)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchBalance(); });
}

// ============================================================
// INIT
// ============================================================
async function init() {
  buildInitialStrips();
  updateBet();
  updateBalance();
  updateWin(0);
  updateFreeSpins(0);
  bindEvents();
  if (loadSession()) {
    await fetchBalance();
    setSpinButtonState();
  }
}

init();
