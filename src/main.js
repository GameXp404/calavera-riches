import * as PIXI from 'pixi.js';
import '../css/style.css';
import { GAME_CONFIG, ASSET_PATH, FREE_SPIN_AWARDS, MULTIPLIER_BASE_POOL, DIFFICULTY_PROFILES, GAME_VERSION, BUILD_DATE, WIN_TIERS, ANTE_BET_MULT, BUY_FEATURE_OPTIONS, fmtMoney } from './config.js';
import { Difficulty } from './difficulty.js';
import { evaluateWays, countScatters } from './ways.js';
import { Multiplier } from './multiplier.js';
import { Audio } from './audio.js';
import { WinCelebration } from './winCelebration.js';
import { Reels } from './reels.js';
import { FreeSpin, showTransitionIntro, showSummary } from './freeSpin.js';

// DEV: expose globals for self-test
if (typeof window !== 'undefined') {
  window.Reels = Reels;
  window.FreeSpin = FreeSpin;
  window.Audio = Audio;
}

const SCATTER_ID = 'COFFIN';
const WILD_ID = 'CATRINA';

const Game = {
  app: null,
  state: {
    balance: GAME_CONFIG.STARTING_BALANCE,
    bet: GAME_CONFIG.DEFAULT_BET,
    betIdx: GAME_CONFIG.BET_LEVELS.indexOf(GAME_CONFIG.DEFAULT_BET),
    turbo: 0, // 0=off, 1-5=speed levels
    anteBet: false, // PG Ante Bet: +25% bet for 2× scatter chance
    autoSpinning: false,
    autoRemaining: 0,
    autoConfig: {
      count: 25,            // 0 = infinite
      stopOnFreeSpin: true,
      stopOnBigWin: false,
      stopOnWinAboveBet: 0, // 0 = disabled; otherwise stop if single-win >= bet * X
    },
    stats: { spins: 0, totalBet: 0, totalWin: 0, biggestWin: 0 },
  },

  resetAllData() {
    // Clear persisted settings (keep login)
    ['calavera_difficulty', 'calavera_audio', 'calavera_auto'].forEach(k => localStorage.removeItem(k));

    // Game state
    this.state.balance = GAME_CONFIG.STARTING_BALANCE;
    this.state.bet = GAME_CONFIG.DEFAULT_BET;
    this.state.betIdx = GAME_CONFIG.BET_LEVELS.indexOf(GAME_CONFIG.DEFAULT_BET);
    this.state.turbo = 0;
    this.state.autoSpinning = false;
    this.state.autoRemaining = 0;
    this.state.autoConfig = { count: 25, stopOnFreeSpin: true, stopOnBigWin: false, stopOnWinAboveBet: 0 };
    this.state.stats = { spins: 0, totalBet: 0, totalWin: 0, biggestWin: 0 };

    // Submodules
    Multiplier.current = 1;
    Multiplier.isFreeSpin = false;
    if (FreeSpin.active) { FreeSpin.active = false; FreeSpin.remaining = 0; FreeSpin.total = 0; FreeSpin.totalWonInBonus = 0; }
    Difficulty.load(); // re-reads (now defaulted because key cleared)
    Audio.masterVol = 1.0;
    Audio.sfxVol = 0.5;
    Audio.enabled = true;
    if (Audio.masterGain) Audio.masterGain.gain.value = 1.0;
    if (Audio.sfxGain) Audio.sfxGain.gain.value = 0.5;
    Audio.save();

    // UI
    document.getElementById('win').textContent = '0';
    this.updateHUD();
    this.updateMultiplierBadges();
    this.updateAutoLabel();
    Reels.enableFreeSpinMode(false);
    const fsBadge = document.getElementById('freespin-badge');
    if (fsBadge) fsBadge.remove();
  },

  // PER-USER STORAGE: each player (different username) has own keys:
  //   calavera_<username>_auto    — auto-spin config
  //   calavera_<username>_player  — turbo, betIdx, balance
  // Username comes from localStorage[LOGIN_KEY] set during login.
  _getUser() {
    const u = (typeof localStorage !== 'undefined' && localStorage.getItem('calavera_user')) || 'guest';
    return u.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24) || 'guest';
  },

  loadAutoConfig() {
    try {
      const key = `calavera_${this._getUser()}_auto`;
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      if (typeof s.count === 'number')             this.state.autoConfig.count = s.count;
      if (typeof s.stopOnFreeSpin === 'boolean')   this.state.autoConfig.stopOnFreeSpin = s.stopOnFreeSpin;
      if (typeof s.stopOnBigWin === 'boolean')     this.state.autoConfig.stopOnBigWin = s.stopOnBigWin;
      if (typeof s.stopOnWinAboveBet === 'number') this.state.autoConfig.stopOnWinAboveBet = s.stopOnWinAboveBet;
    } catch (_) {}
  },
  saveAutoConfig() {
    try { localStorage.setItem(`calavera_${this._getUser()}_auto`, JSON.stringify(this.state.autoConfig)); } catch (_) {}
  },

  // Persist turbo level + bet level + balance so player preferences + saldo survive refresh.
  // Per-user keyed — different usernames keep separate balances.
  loadPlayerPrefs() {
    try {
      const key = `calavera_${this._getUser()}_player`;
      const p = JSON.parse(localStorage.getItem(key) || '{}');
      if (typeof p.turbo === 'number') this.state.turbo = Math.max(0, Math.min(5, p.turbo));
      if (typeof p.betIdx === 'number' && p.betIdx >= 0 && p.betIdx < GAME_CONFIG.BET_LEVELS.length) {
        this.state.betIdx = p.betIdx;
        this.state.bet = GAME_CONFIG.BET_LEVELS[p.betIdx];
      }
      if (typeof p.balance === 'number' && p.balance >= 0) {
        this.state.balance = p.balance;
      }
      if (typeof p.anteBet === 'boolean') this.state.anteBet = p.anteBet;
      if (p.stats && typeof p.stats === 'object') {
        this.state.stats.spins      = Number(p.stats.spins) || 0;
        this.state.stats.totalBet   = Number(p.stats.totalBet) || 0;
        this.state.stats.totalWin   = Number(p.stats.totalWin) || 0;
        this.state.stats.biggestWin = Number(p.stats.biggestWin) || 0;
      }
    } catch (_) {}
  },
  savePlayerPrefs() {
    try {
      const key = `calavera_${this._getUser()}_player`;
      localStorage.setItem(key, JSON.stringify({
        turbo: this.state.turbo,
        betIdx: this.state.betIdx,
        balance: this.state.balance,
        anteBet: this.state.anteBet,
        stats: this.state.stats,
      }));
    } catch (_) {}
  },

  // Effective bet = base bet × 1.25 saat Ante Bet ON. Dipakai oleh:
  //   - spin() balance deduction
  //   - WAY_BET_DIVISOR calculation di ways.js (this.state.bet passed in)
  //   - buy feature cost
  effectiveBet() {
    return this.state.anteBet ? Math.round(this.state.bet * ANTE_BET_MULT) : this.state.bet;
  },

  prebootSettings() {
    // Load persisted settings before any UI binds them (so sliders/cards show correct state)
    Difficulty.load();
    Audio.load();
    this.loadAutoConfig();
    this.loadPlayerPrefs();
  },

  async init() {
    const canvasParent = document.getElementById('pixi-canvas');
    const rect = canvasParent.getBoundingClientRect();
    const w = Math.max(rect.width, 100);
    const h = Math.max(rect.height, 100);

    // Tier already detected at load time (lihat detectDeviceTier di bawah file)
    const tier = window.__DEVICE_TIER__ || 'pc';
    this._deviceTier = tier;
    this._isMobile = tier !== 'pc';

    // Per-tier PIXI config:
    const dpr = window.devicePixelRatio || 1;
    const tierConfig = {
      pc:   { resolution: Math.min(dpr, 2), antialias: true,  maxFPS: 60 },
      high: { resolution: Math.min(dpr, 1.5), antialias: true,  maxFPS: 60 },
      mid:  { resolution: 1.0, antialias: false, maxFPS: 30 },
      low:  { resolution: 1.0, antialias: false, maxFPS: 24 }, // Samsung A06 lebih hemat
    };
    const cfg = tierConfig[tier];

    this.app = new PIXI.Application({
      width: w, height: h, backgroundAlpha: 0,
      antialias: cfg.antialias,
      resolution: cfg.resolution,
      autoDensity: true,
      powerPreference: tier === 'low' ? 'low-power' : 'high-performance',
    });
    this.app.ticker.maxFPS = cfg.maxFPS;
    console.log(`[device] tier=${tier}, dpr=${dpr}, resolution=${cfg.resolution}, fps=${cfg.maxFPS}`);
    canvasParent.appendChild(this.app.view);

    await this.preloadAssets();
    const setProg = window.__setSplashProgress || (() => {});

    Reels.init(this.app, this.app.stage);
    setProg(90);
    Audio.init();
    setProg(93);

    this.wireUI();
    this.updateHUD();
    this.updateMultiplierBadges();
    // Sync turbo button UI with persisted state (saved via loadPlayerPrefs in prebootSettings)
    this.setTurbo(this.state.turbo);
    // Sync bet button disabled state (might be at min/max from loaded prefs)
    this._refreshBetButtons();
    setProg(98);
    // Start ambient game music after init
    Audio.playGameMusic?.();

    // Simpan ukuran canvas saat init sebagai "virtual reference" — semua resize
    // berikutnya akan scale relatif ke ukuran ini, BUKAN rebuild sprites.
    this._virtualSize = { w, h };

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.handleResize());
      ro.observe(canvasParent);
    }
    window.addEventListener('resize', () => this.handleResize());

    window.__GAME__ = this;
    window.__REELS__ = Reels;
    window.__WIN__ = WinCelebration;
    window.__FS__ = FreeSpin;
    window.__M__ = Multiplier;
    window.__AUDIO__ = Audio;
    window.__DIFF__ = Difficulty;

    // Schedule idle attract pulse on spin button (10s no input → gold pulse)
    this._wireIdleAttract();
  },

  async preloadAssets() {
    const paths = Object.values(ASSET_PATH);
    const setProg = window.__setSplashProgress || (() => {});
    setProg(5); // initial nudge so user sees movement immediately
    try {
      // PIXI.Assets.load supports onProgress callback (0..1)
      await PIXI.Assets.load(paths, (frac) => {
        setProg(5 + frac * 80); // assets account for 5-85% of total progress
      });
      console.log('[assets] preloaded', paths.length);
      setProg(85);
    } catch (e) {
      console.warn('[assets] preload err', e);
      setProg(85);
    }
  },

  wireUI() {
    document.getElementById('btn-spin').addEventListener('click', (e) => {
      Audio.buttonClick?.();
      // Brief radial gold flare on press for tactile feedback
      const b = e.currentTarget;
      b.classList.remove('flare');
      void b.offsetWidth;
      b.classList.add('flare');
      setTimeout(() => b.classList.remove('flare'), 700);
      this.spin();
    });
    document.getElementById('btn-bet-plus').addEventListener('click', () => {
      // Only play SFX if bet actually changed (skip when at max)
      if (this.changeBet(+1)) Audio.betChange?.(+1);
    });
    document.getElementById('btn-bet-minus').addEventListener('click', () => {
      if (this.changeBet(-1)) Audio.betChange?.(-1);
    });
    this.wirePickers();
    this.wireBuyFeature();
    this.wireAnteBet();

    const info = document.getElementById('btn-info');
    if (info) info.addEventListener('click', () => this.togglePaytable());
    const snd = document.getElementById('btn-sound');
    if (snd) snd.addEventListener('click', () => {
      Audio.toggle();
      snd.classList.toggle('muted', !Audio.enabled);
    });

    // Menu modal — full overlay style (Wild Bandito reference)
    const menuBtn = document.getElementById('btn-menu');
    const menuModal = document.getElementById('menu-modal');
    const menuModalClose = document.getElementById('menu-modal-close');
    const balanceDisplay = document.getElementById('menu-balance-display');
    const fmtRp = (v) => 'Rp ' + v.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const openMenu = () => {
      if (balanceDisplay) balanceDisplay.textContent = fmtRp(this.state.balance);
      menuModal?.classList.remove('hidden');
    };
    const closeMenu = () => menuModal?.classList.add('hidden');
    menuBtn?.addEventListener('click', (e) => { e.stopPropagation(); Audio.uiTap?.(1.2); openMenu(); });
    menuModalClose?.addEventListener('click', () => { Audio.uiTap?.(0.85); closeMenu(); });
    // Click outside modal content (backdrop) closes
    menuModal?.addEventListener('click', (e) => { if (e.target === menuModal) closeMenu(); });
    // Auto-close menu when any action button clicked (except sound which toggles in-place)
    document.getElementById('btn-info')?.addEventListener('click', () => setTimeout(closeMenu, 50));
    document.getElementById('btn-rules')?.addEventListener('click', () => {
      // Rules opens same paytable info modal for now (treat as game rules reference)
      document.getElementById('btn-info')?.click();
    });
    document.getElementById('btn-history')?.addEventListener('click', () => {
      // History — show simple alert with session stats for now
      const s = this.state.stats || {};
      alert(`Riwayat Sesi:\nTotal Spin: ${s.spins || 0}\nTotal Taruhan: Rp ${(s.totalBet || 0).toLocaleString('id-ID')}\nTotal Menang: Rp ${(s.totalWin || 0).toLocaleString('id-ID')}\nWin Terbesar: Rp ${(s.biggestWin || 0).toLocaleString('id-ID')}`);
    });
    document.getElementById('btn-logout')?.addEventListener('click', () => setTimeout(closeMenu, 50));
    // Hidden admin trigger — click hidden gear button or shift+click avatar
    const adminTrigger = document.getElementById('btn-admin');
    adminTrigger?.addEventListener('click', () => setTimeout(closeMenu, 50));
    const avatarEl = menuModal?.querySelector('.avatar-circle');
    avatarEl?.addEventListener('click', (e) => {
      if (e.shiftKey) adminTrigger?.click();
    });
  },

  wireAdmin() {
    const panel = document.getElementById('admin-panel');
    const openBtn = document.getElementById('btn-admin');
    const closeBtn = document.getElementById('admin-close');
    if (!panel || !openBtn) return;

    const refreshDiff = () => {
      document.getElementById('diff-current').textContent = (DIFFICULTY_PROFILES[Difficulty.current] || {}).label || Difficulty.current;
      document.querySelectorAll('.diff-card').forEach(card => {
        card.classList.toggle('active', card.dataset.diff === Difficulty.current);
      });
    };
    let syncVolUI = null;
    let syncAutoUIRef = null;
    const refresh = () => {
      refreshDiff();
      if (syncVolUI) syncVolUI();
      if (syncAutoUIRef) syncAutoUIRef();
      const verEl = document.getElementById('about-version');
      const dateEl = document.getElementById('about-date');
      if (verEl) verEl.textContent = GAME_VERSION;
      if (dateEl) dateEl.textContent = BUILD_DATE;
      const s = this.state.stats;
      const $ = (id) => document.getElementById(id);
      if ($('adm-spins'))    $('adm-spins').textContent = fmtMoney(s.spins);
      if ($('adm-totalbet')) $('adm-totalbet').textContent = fmtMoney(s.totalBet);
      if ($('adm-totalwin')) $('adm-totalwin').textContent = fmtMoney(s.totalWin);
      const netEl = $('adm-netpl');
      if (netEl) {
        const net = s.totalWin - s.totalBet;
        netEl.textContent = (net >= 0 ? '+' : '−') + fmtMoney(Math.abs(net));
        netEl.style.color = net >= 0 ? '#1abc9c' : '#ff6b6b';
      }
      if ($('adm-curmult'))  $('adm-curmult').textContent = '×' + Multiplier.current;
      if ($('adm-fsactive')) $('adm-fsactive').textContent = FreeSpin.active ? `ON (${FreeSpin.remaining}/${FreeSpin.total})` : 'OFF';
      const balInput = $('adm-balance-input');
      if (balInput) {
        balInput.value = '';
        balInput.placeholder = 'Saldo: ' + fmtMoney(this.state.balance);
      }
    };

    document.querySelectorAll('.diff-card').forEach(card => {
      card.addEventListener('click', () => {
        const level = card.dataset.diff;
        if (Difficulty.set(level)) refreshDiff();
      });
    });

    // Volume sliders
    const masterSlider = document.getElementById('vol-master');
    const sfxSlider = document.getElementById('vol-sfx');
    const masterVal = document.getElementById('vol-master-val');
    const sfxVal = document.getElementById('vol-sfx-val');
    const volToggle = document.getElementById('vol-toggle');
    const sndBtn = document.getElementById('btn-sound');
    syncVolUI = () => {
      const mp = Math.round(Audio.masterVol * 100);
      const sp = Math.round(Audio.sfxVol * 100);
      masterSlider.value = mp;
      sfxSlider.value = sp;
      masterVal.textContent = mp + '%';
      sfxVal.textContent = sp + '%';
      masterSlider.style.setProperty('--p', mp + '%');
      sfxSlider.style.setProperty('--p', sp + '%');
      volToggle.textContent = Audio.enabled ? 'ON' : 'OFF';
      volToggle.style.background = Audio.enabled ? 'linear-gradient(180deg,#16a085,#0e6b59)' : 'rgba(0,0,0,0.4)';
    };
    masterSlider.addEventListener('input', (e) => {
      Audio.setMaster(parseInt(e.target.value, 10) / 100);
      syncVolUI();
    });
    sfxSlider.addEventListener('input', (e) => {
      Audio.setSfx(parseInt(e.target.value, 10) / 100);
      syncVolUI();
    });
    volToggle.addEventListener('click', () => {
      Audio.toggle();
      syncVolUI();
      if (sndBtn) sndBtn.classList.toggle('muted', !Audio.enabled);
    });

    // Auto-spin config
    const autoCountWrap = document.getElementById('auto-count');
    const autoFs = document.getElementById('auto-stop-fs');
    const autoBig = document.getElementById('auto-stop-big');
    const autoWinOn = document.getElementById('auto-stop-win-on');
    const autoWinX = document.getElementById('auto-stop-win-x');
    const syncAutoUI = () => {
      const c = this.state.autoConfig;
      autoCountWrap.querySelectorAll('button').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.count, 10) === c.count);
      });
      autoFs.checked = c.stopOnFreeSpin;
      autoBig.checked = c.stopOnBigWin;
      autoWinOn.checked = c.stopOnWinAboveBet > 0;
      autoWinX.value = c.stopOnWinAboveBet || 0;
    };
    syncAutoUIRef = syncAutoUI;
    autoCountWrap.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.autoConfig.count = parseInt(btn.dataset.count, 10);
        this.saveAutoConfig();
        syncAutoUI();
      });
    });
    autoFs.addEventListener('change', () => { this.state.autoConfig.stopOnFreeSpin = autoFs.checked; this.saveAutoConfig(); });
    autoBig.addEventListener('change', () => { this.state.autoConfig.stopOnBigWin = autoBig.checked; this.saveAutoConfig(); });
    autoWinOn.addEventListener('change', () => {
      this.state.autoConfig.stopOnWinAboveBet = autoWinOn.checked ? (parseInt(autoWinX.value, 10) || 50) : 0;
      if (autoWinOn.checked && (!parseInt(autoWinX.value, 10))) autoWinX.value = 50;
      this.saveAutoConfig();
      syncAutoUI();
    });
    autoWinX.addEventListener('input', () => {
      const v = parseInt(autoWinX.value, 10);
      if (autoWinOn.checked && v > 0) {
        this.state.autoConfig.stopOnWinAboveBet = v;
        this.saveAutoConfig();
      }
    });

    // Reset all data
    document.getElementById('btn-reset-all').addEventListener('click', () => {
      if (!confirm('Yakin reset semua data? Saldo, stats, dan pengaturan akan kembali ke default. (Login tetap)')) return;
      this.resetAllData();
      refresh();
    });
    const devToggle = document.getElementById('dev-toggle');
    const devTools = document.getElementById('dev-tools');
    const devLocked = document.getElementById('dev-locked');
    const devWrap = document.getElementById('dev-tools-wrap');
    const devPass = document.getElementById('dev-pass');
    const devUnlock = document.getElementById('dev-unlock');
    const devErr = document.getElementById('dev-pass-err');

    // Dev Tools default collapsed (toggle still works)
    if (devToggle && devTools) {
      devTools.classList.add('hidden');
      devToggle.addEventListener('click', () => {
        devToggle.classList.toggle('open');
        devTools.classList.toggle('hidden');
      });
    }

    // Password unlock — sessionStorage so each browser session unlocks once
    const DEV_PASS = 'admin123';
    const DEV_UNLOCK_KEY = 'calavera_dev_unlocked';
    const applyUnlockState = () => {
      const unlocked = sessionStorage.getItem(DEV_UNLOCK_KEY) === '1';
      if (devLocked) devLocked.classList.toggle('hidden', unlocked);
      if (devWrap)   devWrap.classList.toggle('hidden', !unlocked);
    };
    if (devUnlock) {
      devUnlock.addEventListener('click', () => {
        if (!devPass) return;
        if (devPass.value === DEV_PASS) {
          sessionStorage.setItem(DEV_UNLOCK_KEY, '1');
          devErr.textContent = '';
          devPass.value = '';
          applyUnlockState();
        } else {
          devErr.textContent = 'Password salah!';
          devPass.value = '';
          devPass.focus();
        }
      });
      devPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') devUnlock.click(); });
    }
    applyUnlockState();

    const open = () => {
      refresh();
      panel.classList.remove('hidden');
      document.getElementById('util-menu')?.classList.remove('show');
    };
    const close = () => panel.classList.add('hidden');

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    panel.addEventListener('click', (e) => { if (e.target === panel) close(); });

    const balSet = document.getElementById('adm-balance-set');
    if (balSet) balSet.addEventListener('click', () => {
      const v = parseInt(document.getElementById('adm-balance-input').value, 10);
      if (!isNaN(v) && v >= 0) {
        this.state.balance = v;
        this.updateHUD();
        refresh();
      }
    });
    const balReset = document.getElementById('adm-balance-reset');
    if (balReset) balReset.addEventListener('click', () => {
      this.state.balance = GAME_CONFIG.STARTING_BALANCE;
      this.updateHUD();
      refresh();
    });

    const forceTier = (tier, mult) => {
      if (!this.app) { alert('Login dulu untuk test animasi.'); return; }
      if (Reels.spinning) return;
      const amount = this.state.bet * mult;
      this.state.balance += amount;
      this.state.stats.totalWin += amount;
      this.updateHUD();
      if (tier === 'LEGENDARY')    Audio.winLegendary?.();
      else if (tier === 'EPIC')    Audio.winEpic?.();
      else                          Audio.winBig?.();
      setTimeout(() => Audio.playVoice?.(tier), 350);
      try {
        WinCelebration.play(tier, amount, this.app, this.app.stage, () => refresh());
      } catch (e) { console.error(e); }
      close();
    };
    const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bindClick('adm-force-big',  () => forceTier('BIG', 6));
    bindClick('adm-force-mega', () => forceTier('MEGA', 12));
    bindClick('adm-force-epic', () => forceTier('EPIC', 28));
    bindClick('adm-force-leg',  () => forceTier('LEGENDARY', 60));

    const forceFS = (scatterCount) => {
      if (!this.app) { alert('Login dulu untuk trigger free spin.'); return; }
      if (FreeSpin.active || Reels.spinning) return;
      const award = FreeSpin.start(scatterCount, this.state.bet);
      // E3: switch music — fade out base game music, start dramatic FS music
      Audio.stopGameMusic?.(900);
      Audio.freeSpinTrigger?.();
      setTimeout(() => Audio.playFreeSpinMusic?.(), 1400);
      showTransitionIntro(this.app, this.app.stage, scatterCount, award, award.startMult, () => {
        Multiplier.startFreeSpin(award.startMult);
        Reels.enableFreeSpinMode(true);
        this.updateFreeSpinHUD();
        this.updateMultiplierBadges();
        setTimeout(() => this.spin(), 600);
      });
      close();
    };
    bindClick('adm-force-fs3', () => forceFS(3));
    bindClick('adm-force-fs4', () => forceFS(4));
    bindClick('adm-force-fs5', () => forceFS(5));

    bindClick('adm-reset-mult', () => {
      Multiplier.current = 1;
      Multiplier.isFreeSpin = false;
      this.updateMultiplierBadges();
      refresh();
    });

    this._adminRefresh = refresh;
  },

  async spin() {
    if (Reels.spinning) return;

    const inBonus = FreeSpin.active;
    if (!inBonus) {
      const eBet = this.effectiveBet();
      if (this.state.balance < eBet) {
        // Proper insufficient-balance dialog instead of silent refund.
        // Offers: lower bet (auto pick lowest level player can afford) or top-up via admin.
        this._showInsufficientBalanceDialog();
        return;
      }
      this.state.balance -= eBet;
      this.state.stats.spins += 1;
      this.state.stats.totalBet += eBet;
      this.savePlayerPrefs(); // persist new balance (bet deducted)
    }
    // Cancel any in-flight win counter animation from the previous spin before
    // resetting to '0'. Otherwise the leftover requestAnimationFrame writes back
    // the previous total a few ms after we clear, producing a brief flicker.
    const _winEl = document.getElementById('win');
    if (_winEl?._counterRaf) cancelAnimationFrame(_winEl._counterRaf);
    _winEl.textContent = '0';
    this.updateHUD();

    // Defensive reset: clear any leftover cascade pitch state from a previous
    // spin that errored mid-cascade. Without this, the next spin's cascade pop
    // / win highlight audio plays at the wrong pitch.
    if (Reels) Reels._cascadeIter = 0;

    const spinBtn = document.getElementById('btn-spin');
    spinBtn.disabled = true;

    try {
      await this._spinBody(spinBtn);
    } catch (e) {
      console.error('[spin error]', e);
      // Safety: never leave the button disabled if an unexpected error occurs.
      // Without this, a thrown exception during cascade/celebration/intro would
      // permanently lock the SPIN button and player must reload.
      spinBtn.disabled = false;
      // Also clear leaked cascade music layers + reset stage transform so the
      // next spin starts from a clean state.
      Audio.clearCascadeIntensity?.();
      try {
        const stage = this.app?.stage;
        if (stage) { stage.x = 0; stage.y = 0; }
      } catch (_) {}
      if (Reels.spinning) Reels.spinning = false;
    }
  },

  async _spinBody(spinBtn) {
    // WB-style multiplier reset:
    //   Base game: reset to ×1 at the START of every spin (regardless of prior win)
    //   Free Spin: NEVER reset — multiplier is sticky across FS spins (WB convention)
    if (!FreeSpin.active) {
      Multiplier.reset();
      this.updateMultiplierBadges();
    }

    // Sync ante-bet flag so Reels.randomSymbol can boost scatter weight.
    Reels._anteBet = this.state.anteBet;
    let grid = await Reels.spin(this.state.turbo);
    // Defensive: if a concurrent spin somehow slipped past the spinning guard,
    // Reels.spin() resolves with null instead of a grid. Refund the bet and
    // bail out cleanly rather than crashing in evaluateWays(null).
    if (!grid) {
      if (!FreeSpin.active) {
        this.state.balance += this.state.bet;
        this.updateHUD();
      }
      spinBtn.disabled = false;
      return;
    }

    // Wild Expand DISABLED permanently per user decision (2026-05-20 final).
    // Catrina ALWAYS stays single-cell where it lands, both base spin AND free
    // spin. The only mechanic that spawns wilds is Gold-Framed → Wild conversion.

    // Initial evaluation — use effective bet so Ante Bet's extra 25% is reflected
    // in payout (player pays more, win amount also scales by the same factor).
    const _evalBet = this.effectiveBet();
    let result = evaluateWays(grid, _evalBet);
    const scatterCount = countScatters(grid);
    const initialHadWin = result.totalWin > 0;

    // CASCADE LOOP — PG Wild Bandito style with Gold-Framed in-place conversion.
    // Gold-converted wilds PERSIST this round (not popped with rest of winning cells);
    // they stay in place for potential involvement in the NEXT cascade.
    let multipliedWin = 0;
    let cascadeIter = 0;
    let allWins = [];
    // E2: reset any leftover cascade music layers from previous spin
    Audio.clearCascadeIntensity?.();
    // Cascade until no more wins. Cap at 50 matches headless RTP sim (src/sim.js).
    // Previously capped at 5 which silently dropped legitimate cascade wins and
    // skewed RTP far below the calibrated 96.6% target.
    while (result.totalWin > 0 && cascadeIter < 50) {
      // Sync cascade iter to Reels so per-cell sound calls can pitch-escalate
      Reels._cascadeIter = cascadeIter;

      // WB GOLD-FRAME RULE (corrected):
      //   Gold cells DO NOT substitute as wild during payout evaluation.
      //   They keep their own symbol identity. They convert to Wild ONLY IF
      //   their OWN symbol is part of a winning combo (not as a wild substitute).
      //   Previously we treated gold as wild, which caused ALL gold cells on a
      //   reel to convert whenever any winning combo touched that reel.
      const goldKeys = new Set();
      result.wins.forEach(w => {
        if (w.isScatter || !w.cells) return;
        w.cells.forEach(c => {
          const sym = Reels.reels[c.reel]?.symbols[c.row];
          // Only mark gold cells whose ACTUAL symbol matched the winning target.
          // Since result.wins comes from normal evaluation (no gold-as-wild),
          // a cell in w.cells means its real symbol participated in this win.
          if (sym?.isGoldFrame) goldKeys.add(`${c.reel}-${c.row}`);
        });
      });

      // 3. Pay win, accumulate
      const cascadeWin = Multiplier.apply(result.totalWin);
      multipliedWin += cascadeWin;
      allWins = allWins.concat(result.wins);

      // 4. Highlight ALL winning cells (gold-framed cells still showing original
      //    symbol — they'll pop in step 5 like other winners).
      Reels.highlightWins(result.wins);
      await new Promise(r => setTimeout(r, 700));

      // 5. Pop ALL winning cells. Gold positions respawn as Wild after pop.
      await Reels.removeWinningCells(result.wins, goldKeys);
      await Reels.cascade();

      // 6. Bump multiplier
      if (FreeSpin.active) Multiplier.bumpFreeSpin();
      else Multiplier.bumpBase();
      this.updateMultiplierBadges();
      Audio.multBump(Multiplier.current);

      // 7. Re-evaluate fresh grid for next cascade
      result = evaluateWays(Reels.grid, _evalBet);
      cascadeIter++;
      // E2: ramp music intensity AFTER each cascade completes (layers stack progressively)
      Audio.setCascadeIntensity?.(cascadeIter);
    }
    // E2: cascade chain ended (regardless of cause) — fade out all extra layers
    Audio.clearCascadeIntensity?.();

    if (FreeSpin.active && multipliedWin > 0) FreeSpin.addWin(multipliedWin);
    // Multiplier reset removed here — moved to start of _spinBody for WB-style behavior:
    //   Base game resets every spin (handled at _spinBody top).
    //   FS stays sticky (never reset between FS spins).

    const finishSpin = async () => {
      this.updateMultiplierBadges();
      if (FreeSpin.active) {
        const summary = FreeSpin.consume();
        this.updateFreeSpinHUD();
        if (summary) {
          // Await BONUS COMPLETE summary popup fully closes before returning
          await new Promise((resolveSummary) => {
            this.endFreeSpinMode(summary, () => {
              spinBtn.disabled = false;
              resolveSummary();
            });
          });
          return;
        }
        // Auto-chain next free spin (no need to press SPIN button)
        spinBtn.disabled = true;
        setTimeout(() => { if (FreeSpin.active) this.spin(); }, 800);
        return;
      }
      spinBtn.disabled = false;
    };

    if (scatterCount >= 3 && !FreeSpin.active) {
      const award = FreeSpin.start(scatterCount, this.state.bet);
      this.state.balance += multipliedWin;
      if (multipliedWin > 0) {
        this.state.stats.totalWin += multipliedWin;
        if (multipliedWin > (this.state.stats.biggestWin || 0)) {
          this.state.stats.biggestWin = multipliedWin;
        }
      }
      this.updateHUD();
      this.savePlayerPrefs(); // persist balance after FS trigger win
      // E3: switch music — fade out base game music, start dramatic FS music
      Audio.stopGameMusic?.(900);
      Audio.freeSpinTrigger();
      // Slight delay so fanfare gets the spotlight before FS music swells in
      setTimeout(() => Audio.playFreeSpinMusic?.(), 1400);
      // Await transition intro fully closes before scheduling first FS spin
      await new Promise((resolve) => {
        showTransitionIntro(this.app, this.app.stage, scatterCount, award, award.startMult, () => {
          Multiplier.startFreeSpin(award.startMult);
          Reels.enableFreeSpinMode(true);
          this.updateFreeSpinHUD();
          this.updateMultiplierBadges();
          resolve();
        });
      });
      spinBtn.disabled = true;
      setTimeout(() => { if (FreeSpin.active) this.spin(); }, 400);
      return;
    }

    if (scatterCount >= 3 && FreeSpin.active) {
      const rt = FreeSpin.retrigger(scatterCount);
      if (rt) {
        // Update HUD immediately so player sees +5 reflected on counter during the flash
        this.updateFreeSpinHUD();
        Audio.freeSpinTrigger();
        await this.flashRetrigger(rt.addSpins);
      }
    }

    if (multipliedWin > 0) {
      const tier = WinCelebration.determineTier(multipliedWin, this.state.bet);
      // For NORMAL tier wins (no celebration popup), roll the HUD counter ourselves.
      // For BIG/MEGA/EPIC/LEGENDARY, the celebration popup drives winEl text
      // via onUpdate — no need to roll twice (avoids flicker conflict).
      if (tier === 'NORMAL') {
        this.displayWin(multipliedWin, tier);
      }
      // Win-tier audio: distinct cue per tier for premium feel
      if (tier === 'LEGENDARY')    Audio.winLegendary();
      else if (tier === 'EPIC')    Audio.winEpic();
      else if (tier === 'MEGA')    Audio.winMega();
      else if (tier === 'BIG')     Audio.winBig();
      else                          Audio.winSmall();
      // Voice announcement (BIG/MEGA/EPIC/LEGENDARY) — sample-first, TTS fallback
      if (tier === 'LEGENDARY' || tier === 'EPIC' || tier === 'MEGA' || tier === 'BIG') {
        // Delay slightly so it lands after the win sound's initial impact
        setTimeout(() => Audio.playVoice?.(tier), 350);
      }
      console.log('[WIN]', { tier, amount: multipliedWin.toFixed(2), bet: this.state.bet, cascades: cascadeIter, ways: allWins.length, bonus: FreeSpin.active, mult: Multiplier.current });
      // Await celebration so auto-spin pauses while popup is on screen
      this._celebrating = true;
      await new Promise((resolve) => {
        let celebrationDone = false;
        const finalize = async () => {
          if (celebrationDone) return;
          celebrationDone = true;
          this._celebrating = false;
          // Defensive: if WinCelebration's onComplete didn't fire (e.g. timeline
          // killed externally or 12s safety timer ran out), reset any leftover
          // shake offset on the stage so the next spin doesn't render skewed.
          try {
            const _stage = this.app?.stage;
            if (_stage) { _stage.x = 0; _stage.y = 0; }
          } catch (_) {}
          this.state.balance += multipliedWin;
          this.state.stats.totalWin += multipliedWin;
          if (multipliedWin > (this.state.stats.biggestWin || 0)) {
            this.state.stats.biggestWin = multipliedWin;
          }
          this.updateHUD();
          this.savePlayerPrefs(); // persist new balance after win
          await finishSpin();
          resolve();
        };
        try {
          WinCelebration.play(tier, multipliedWin, this.app, this.app.stage, finalize);
        } catch (e) {
          console.error('[win celebration error]', e);
          finalize();
        }
        // Safety net: force finalize after max duration (no stuck button)
        setTimeout(finalize, 12000);
      });
    } else {
      await finishSpin();
    }
  },

  endFreeSpinMode(summary, onDone) {
    Reels.enableFreeSpinMode(false);
    Multiplier.endFreeSpin();
    this.updateFreeSpinHUD();
    this.updateMultiplierBadges();
    // E4: slow fade FS music as summary popup appears (1.5s cinematic)
    Audio.stopFreeSpinMusic?.(1500);
    showSummary(this.app, this.app.stage, summary, () => {
      // Resume base game music when summary popup closes
      Audio.playGameMusic?.();
      if (onDone) onDone();
    });
  },

  updateFreeSpinHUD() {
    let badge = document.getElementById('freespin-badge');
    if (!FreeSpin.active) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'freespin-badge';
      badge.className = 'freespin-badge';
      document.getElementById('game-container').appendChild(badge);
    }
    badge.innerHTML = `<span class="fs-label">FREE SPINS</span><span class="fs-count">${FreeSpin.remaining}/${FreeSpin.total}</span><span class="fs-mult">${Multiplier.current}&times;</span>`;
  },

  updateMultiplierBadges() {
    // WB-style multiplier display:
    //   - Center ALWAYS shows current multiplier (×1, ×2, ×3, ×5, ×10, ...)
    //   - Left badge shows PREVIOUS ladder value (hidden if at floor, e.g., cur=1)
    //   - Right badge shows NEXT ladder value (hidden if at cap, e.g., cur=10 in base)
    //   - Center pulses with "bump" effect when multiplier increases
    const leftEl = document.getElementById('mult-left');
    const rightEl = document.getElementById('mult-right');
    const centerBadge = document.querySelector('.mult-badge.center');
    const centerEl = centerBadge && centerBadge.querySelector('.center-mult');
    const cur = Multiplier.current;
    const prev = Multiplier.getPrev();
    const next = Multiplier.getNext();
    const fmt = (v) => '&times;' + v;

    // LEFT: previous ladder value — hide if same as current (we're at floor)
    if (leftEl) {
      const t = leftEl.querySelector('.mult-text');
      if (prev === cur) {
        t.innerHTML = '';
        leftEl.style.opacity = '0';
      } else {
        t.innerHTML = fmt(prev);
        leftEl.style.opacity = '0.55';      // dim — it's the "past" rung
      }
    }
    // RIGHT: next ladder value — hide if same as current (we're at cap)
    if (rightEl) {
      const t = rightEl.querySelector('.mult-text');
      if (next === cur) {
        t.innerHTML = '';
        rightEl.style.opacity = '0';
      } else {
        t.innerHTML = fmt(next);
        rightEl.style.opacity = '0.85';     // brighter — it's the "upcoming" rung
      }
    }
    // CENTER: always show current (×1 included) — WB convention
    if (centerEl) {
      const oldVal = centerEl._lastMult;
      centerEl.innerHTML = fmt(cur);
      centerEl._lastMult = cur;
      // Bump animation when mult INCREASES
      if (oldVal != null && cur > oldVal && centerBadge) {
        centerBadge.classList.remove('mult-bump');
        // Force reflow so re-adding the class re-triggers the animation
        void centerBadge.offsetWidth;
        centerBadge.classList.add('mult-bump');
      }
    }
    if (centerBadge) centerBadge.classList.add('active'); // always visible
  },

  flashRetrigger(addSpins) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'retrigger-flash';
      el.textContent = `+${addSpins} FREE SPINS`;
      document.getElementById('game-container').appendChild(el);
      // CSS .show triggers full 2.1s cinematic animation (entry, hold, exit)
      setTimeout(() => el.classList.add('show'), 10);
      // Cleanup after animation completes (2.1s + tiny buffer)
      setTimeout(() => { el.remove(); resolve(); }, 2250);
    });
  },

  togglePaytable() {
    const modal = document.getElementById('info-modal');
    if (!modal) return;
    if (modal.classList.contains('hidden')) {
      this._infoOpen('paytable');
    } else {
      modal.classList.add('hidden');
    }
  },

  async _infoOpen(tab) {
    const modal = document.getElementById('info-modal');
    modal.classList.remove('hidden');
    await this._infoRender(tab);
    if (!modal._wired) {
      modal._wired = true;
      modal.querySelectorAll('.info-tab[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => this._infoRender(btn.dataset.tab));
      });
      const close = () => modal.classList.add('hidden');
      document.getElementById('info-back').addEventListener('click', close);
      modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
      // Wire footer action buttons (same UX as menu modal)
      document.getElementById('info-tab-sound')?.addEventListener('click', () => {
        Audio.toggle();
      });
      document.getElementById('info-tab-history')?.addEventListener('click', () => {
        const s = this.state.stats || {};
        alert(`Riwayat Sesi:\nTotal Spin: ${s.spins || 0}\nTotal Taruhan: Rp ${(s.totalBet || 0).toLocaleString('id-ID')}\nTotal Menang: Rp ${(s.totalWin || 0).toLocaleString('id-ID')}\nWin Terbesar: Rp ${(s.biggestWin || 0).toLocaleString('id-ID')}`);
      });
      document.getElementById('info-tab-exit')?.addEventListener('click', () => {
        close();
        document.getElementById('btn-logout')?.click();
      });
    }
  },

  async _infoRender(tab) {
    const modal = document.getElementById('info-modal');
    const title = document.getElementById('info-title');
    const body = document.getElementById('info-body');
    modal.querySelectorAll('.info-tab[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const cfg = await import('./config.js');
    if (tab === 'paytable') {
      title.textContent = 'Tabel Bayaran';
      body.innerHTML = this._buildPaytableHTML(cfg);
      modal.classList.add('paytable-view');     // hide bottom footer, pure scrollable
    } else {
      title.textContent = 'Peraturan';
      body.innerHTML = this._buildRulesHTML(cfg);
      modal.classList.remove('paytable-view');  // restore footer for rules view
    }
    body.scrollTop = 0;
  },

  _buildPaytableHTML(cfg) {
    const { SYMBOLS, ASSET_PATH } = cfg;
    const scatter = SYMBOLS.find(s => s.isScatter);
    const wild = SYMBOLS.find(s => s.isWild);
    const payable = SYMBOLS.filter(s => !s.isWild && !s.isScatter);

    // Symbol cell — image left, payouts right (5/4/3 ways)
    const cell = (s) => `
      <div class="sym-cell">
        <img src="/${ASSET_PATH[s.id]}" alt="${s.label}">
        <div class="sym-pay-col">
          <div><span class="ways">5</span><span class="v">${s.payouts[5]}</span></div>
          <div><span class="ways">4</span><span class="v">${s.payouts[4]}</span></div>
          <div><span class="ways">3</span><span class="v">${s.payouts[3]}</span></div>
        </div>
      </div>
    `;

    return `
      <div class="paytable-section-header">Nilai Bayaran Simbol</div>

      <!-- Scatter centered standalone -->
      <div class="paytable-scatter-row">
        <img src="/${ASSET_PATH[scatter.id]}" alt="Scatter" class="paytable-scatter-img">
        <div class="paytable-scatter-label">Simbol<br>Scatter</div>
      </div>

      <!-- Wild row (2-col layout: wild | first paying symbol) -->
      <div class="paytable-grid">
        <div class="sym-cell sym-cell-wild">
          <img src="/${ASSET_PATH[wild.id]}" alt="Wild">
          <div class="sym-wild-label">Simbol<br>Wild</div>
        </div>
        ${cell(payable[0])}
      </div>

      <!-- Remaining symbols in 2-column grid -->
      <div class="paytable-grid">
        ${payable.slice(1).map(cell).join('')}
      </div>

      <div class="paytable-notes">
        <p>• Simbol Wild menggantikan semua simbol kecuali simbol Scatter.</p>
        <p>• Simbol Berbingkai Emas hanya muncul di rol 2, 3 dan 4.</p>
      </div>

      <!-- ============ SIMBOL BERBINGKAI EMAS ============ -->
      <div class="paytable-section-header">Simbol Berbingkai Emas</div>
      <div class="paytable-feature-img">
        <div class="gold-frame-demo">
          <div class="gold-frame-row">
            <img src="/${ASSET_PATH.QUEEN}"   alt="Q" class="paytable-mini-sym">
            <img src="/${ASSET_PATH.MARACAS}" alt="Mar" class="paytable-mini-sym gold-framed">
            <img src="/${ASSET_PATH.TEN}"     alt="10" class="paytable-mini-sym gold-framed">
            <img src="/${ASSET_PATH.SKULL}"   alt="Sk" class="paytable-mini-sym gold-framed">
            <img src="/${ASSET_PATH.ACE}"     alt="A" class="paytable-mini-sym">
          </div>
        </div>
      </div>
      <div class="paytable-notes">
        <p>• Selama putaran apa pun, beberapa simbol (kecuali simbol Wild dan simbol Scatter) di rol 2, 3 dan/atau 4 bisa saja berwarna emas.</p>
        <p>• Di setiap babak baru setelah simbol baru berjatuhan, simbol apa pun yang berbingkai emas yang terlibat dalam sebuah kemenangan di babak sebelumnya akan diubah menjadi simbol Wild.</p>
      </div>

      <!-- ============ PENGALI ============ -->
      <div class="paytable-section-header">Pengali</div>
      <div class="paytable-feature-img">
        <div class="paytable-mult-display">
          <span class="mult-badge-demo prev">&times;5</span>
          <span class="mult-badge-demo center">&times;6</span>
          <span class="mult-badge-demo next">&times;7</span>
        </div>
      </div>
      <div class="paytable-notes">
        <p>• Pada awal putaran permainan utama apapun, pengali kemenangan adalah ×1.</p>
        <p>• Selama putaran apa pun, jika terdapat satu atau lebih simbol yang menang di rol, setelah kemenangan dibayarkan dan simbol baru telah berjatuhan, pengali kemenangan akan ditingkatkan sebanyak 1.</p>
      </div>

      <!-- ============ FITUR PUTARAN GRATIS ============ -->
      <div class="paytable-section-header">Fitur Putaran Gratis</div>
      <div class="paytable-feature-img">
        <div class="paytable-scatter-trio">
          <img src="/${ASSET_PATH.COFFIN}" alt="Scatter" class="paytable-mini-sym">
          <img src="/${ASSET_PATH.COFFIN}" alt="Scatter" class="paytable-mini-sym">
          <img src="/${ASSET_PATH.COFFIN}" alt="Scatter" class="paytable-mini-sym">
        </div>
      </div>
      <div class="paytable-notes">
        <p>• 3 simbol Scatter yang muncul di mana saja akan memicu Fitur Putaran Gratis dengan 12 putaran gratis. Setiap simbol Scatter tambahan akan memicu 2 putaran gratis lagi.</p>
        <p>• Selama putaran gratis apapun, jika ada satu atau lebih simbol apa pun yang menang di rol, setelah kemenangan dibayar dan simbol baru telah berjatuhan, pengali kemenangan akan ditingkatkan sebanyak 1.</p>
        <p>• Putaran gratis bisa dipicu ulang.</p>
      </div>

      <!-- ============ BELI FITUR ============ -->
      <div class="paytable-section-header">Beli Fitur</div>
      <div class="paytable-feature-img">
        <div class="paytable-buyfeature-demo">
          <span class="buyfeature-tag">BELI<br>FITUR</span>
        </div>
      </div>
      <div class="paytable-notes">
        <p>• Ketuk pada tombol Beli Fitur untuk membuka menu Beli Fitur.</p>
        <p>• Ketuk pada tombol Mulai untuk membeli Fitur Putaran Gratis dengan harga yang ditampilkan di menu Beli Fitur.</p>
      </div>

      <!-- ============ 1.024 CARA ============ -->
      <div class="paytable-section-header">1.024 cara</div>
      <div class="paytable-notes">
        <p>• Cara taruhan dimenangkan jika simbol-simbol yang menang tampil berurutan dari rol paling kiri ke rol paling kanan.</p>
      </div>
      <div class="paytable-ways-examples">
        <div class="ways-example">
          <div class="ways-grid-mini">
            <div></div><div class="dot"></div><div></div><div class="dot"></div><div></div>
            <div class="dot"></div><div class="dot"></div><div class="dot"></div><div></div><div></div>
            <div class="dot"></div><div></div><div class="dot"></div><div class="dot"></div><div class="dot"></div>
            <div></div><div></div><div></div><div></div><div></div>
          </div>
          <div class="ways-check ok">✓</div>
        </div>
        <div class="ways-example">
          <div class="ways-grid-mini">
            <div></div><div></div><div class="dot"></div><div></div><div></div>
            <div class="dot"></div><div class="dot"></div><div class="dot"></div><div></div><div></div>
            <div></div><div></div><div class="dot"></div><div class="dot"></div><div></div>
            <div></div><div></div><div></div><div></div><div></div>
          </div>
          <div class="ways-check no">✕</div>
        </div>
      </div>
      <div class="paytable-notes">
        <p>• Jumlah total kemenangan cara taruhan untuk setiap simbol dihitung dengan mengalikan jumlah simbol menang yang berdekatan pada setiap simbol dari rol paling kiri ke kanan.</p>
        <p class="ways-formula">Dari Contoh di Atas:<br><b>1 × 3 × 2 = 6</b></p>
        <p>• Pembayaran simbol yang menang dikalikan dengan jumlah kemenangan cara taruhan.</p>
      </div>
      <div class="paytable-example-payout">
        <div class="example-sym">?</div>
        <div class="sym-pay-col">
          <div><span class="ways">5</span><span class="v">500</span></div>
          <div><span class="ways">4</span><span class="v">100</span></div>
          <div><span class="ways">3</span><span class="v">10</span></div>
        </div>
        <div class="example-total">
          Total Kemenangan di Contoh ini:<br><b class="v">10 × 6 = 60</b>
        </div>
      </div>
      <div class="paytable-notes">
        <p>• Setelah bayaran dari setiap babak dibayarkan, semua simbol yang menang akan meledak dan memungkinkan simbol di atasnya untuk berjatuhan dan memulai babak baru.</p>
        <p>• Tambahan kombinasi yang menang akan dihitung di setiap babak hingga tidak ada lagi kombinasi yang menang untuk dihitung.</p>
        <p>• Semua hasil menang ditampilkan dalam nilai uang tunai.</p>
      </div>
    `;
  },

  _buildRulesHTML(cfg) {
    return `
      <div class="info-section-title">Calavera Riches</div>
      <div class="info-block">
        <p><b>Calavera Riches</b> adalah game slot 5 gulungan × 4 baris bertema Día de los Muertos (Hari Orang Mati ala Meksiko) dengan <b>1.024 cara</b> menang.</p>
        <p>Tujuannya: dapatkan kombinasi simbol berurutan dari gulungan paling kiri ke kanan untuk memenangkan hadiah sesuai Tabel Bayaran.</p>
      </div>

      <div class="info-section-title">Simbol</div>
      <div class="info-block">
        <ul>
          <li><b>Simbol Rendah:</b> 10, J, Q, K, A — pembayaran kecil tapi sering keluar.</li>
          <li><b>Simbol Menengah:</b> Maracas, Guitar — pembayaran sedang.</li>
          <li><b>Simbol Tinggi:</b> Mariachi, Guitar, Sugar Skull — pembayaran besar (Mariachi tertinggi).</li>
          <li><b>Wild (Catrina):</b> menggantikan semua simbol kecuali Scatter.</li>
          <li><b>Scatter (Coffin):</b> picu Putaran Gratis. Max 1 per gulungan.</li>
        </ul>
      </div>

      <div class="info-section-title">Pengali (Multiplier)</div>
      <div class="info-block">
        <p>Bola pengali emas di tengah arch menunjukkan kelipatan kemenangan saat ini.</p>
        <p><b>Putaran biasa:</b> ladder linear ×1 → ×2 → ×3 → ×4 → ... → ×10 (naik +1 per cascade win, cap ×10, reset ke ×1 setiap awal spin baru).</p>
        <p><b>Putaran Gratis:</b> ladder linear mulai ×1, naik +1 per cascade win, cap ×50, <b>sticky</b> antar spin FS (tidak reset).</p>
      </div>

      <div class="info-section-title">Fitur Putaran Gratis</div>
      <div class="info-block">
        <ul>
          <li><b>3 Coffin scatter</b> → 12 putaran gratis, mulai pengali ×1</li>
          <li><b>4 Coffin scatter</b> → 14 putaran gratis, mulai pengali ×1</li>
          <li><b>5 Coffin scatter</b> → 16 putaran gratis, mulai pengali ×1</li>
        </ul>
        <p>Putaran gratis bisa di-<b>retrigger</b> jika dapat 3+ scatter lagi (+12/14/16 spin).</p>
        <p>Selama Putaran Gratis, pengali naik +1 per cascade win (cap ×50) dan <b>sticky</b> — tidak reset antar spin FS.</p>
      </div>

      <div class="info-section-title">Kontrol Permainan</div>
      <div class="info-block">
        <ul>
          <li><b>⟳ SPIN:</b> mulai putaran dengan taruhan saat ini.</li>
          <li><b>+ / −:</b> ubah jumlah taruhan.</li>
          <li><b>⚡ TURBO:</b> mempercepat animasi putaran.</li>
          <li><b>▶ AUTO:</b> putar otomatis sesuai jumlah & stop conditions di Pengaturan.</li>
          <li><b>☰ Menu:</b> akses Tabel Bayaran, Suara, Pengaturan, Logout.</li>
        </ul>
      </div>

      <div class="info-section-title">Informasi Tambahan</div>
      <div class="info-block">
        <p><b>RTP:</b> ${(cfg.GAME_CONFIG.RTP * 100).toFixed(1)}%</p>
        <p><b>Versi:</b> ${cfg.GAME_VERSION} (${cfg.BUILD_DATE})</p>
        <p>Mata uang yang digunakan adalah Rupiah (Rp). Hasil putaran ditentukan oleh RNG dan bersifat mutlak.</p>
      </div>
    `;
  },

  changeBet(dir) {
    const idx = Math.max(0, Math.min(GAME_CONFIG.BET_LEVELS.length - 1, this.state.betIdx + dir));
    if (idx === this.state.betIdx) return false; // hit min/max, no change
    this.state.betIdx = idx;
    this.state.bet = GAME_CONFIG.BET_LEVELS[idx];
    this.updateHUD();
    this.savePlayerPrefs();
    this._refreshBetButtons();
    return true;
  },

  // Disable +/- buttons at edges + provide visual feedback (greyed out)
  _refreshBetButtons() {
    const minus = document.getElementById('btn-bet-minus');
    const plus = document.getElementById('btn-bet-plus');
    const maxIdx = GAME_CONFIG.BET_LEVELS.length - 1;
    if (minus) minus.disabled = this.state.betIdx === 0;
    if (plus) plus.disabled = this.state.betIdx === maxIdx;
  },

  // Ante Bet toggle: click button → flip state, refresh UI, persist, sync to Reels.
  wireAnteBet() {
    const btn = document.getElementById('btn-ante-bet');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (FreeSpin.active || Reels.spinning) return;
      this.state.anteBet = !this.state.anteBet;
      this.updateAnteBetUI();
      this.updateHUD();
      this.savePlayerPrefs();
      Audio.uiTap?.(this.state.anteBet ? 1.4 : 1);
    });
    this.updateAnteBetUI();
  },
  updateAnteBetUI() {
    const btn = document.getElementById('btn-ante-bet');
    if (!btn) return;
    btn.classList.toggle('active', !!this.state.anteBet);
    const state = btn.querySelector('.ab-state');
    if (state) state.textContent = this.state.anteBet ? 'ON' : 'OFF';
  },

  wireBuyFeature() {
    const btn = document.getElementById('btn-buy-feature');
    const modal = document.getElementById('buy-modal');
    const tierList = document.getElementById('buy-tier-list');
    const cancelBtn = document.getElementById('buy-cancel');
    if (!btn || !modal || !tierList) return;

    // Trigger free spin starting at given scatter count (3/4/5).
    const triggerBuyFS = (scatterCount) => {
      if (FreeSpin.active || Reels.spinning) return;
      const award = FreeSpin.start(scatterCount, this.state.bet);
      Audio.stopGameMusic?.(900);
      Audio.freeSpinTrigger();
      setTimeout(() => Audio.playFreeSpinMusic?.(), 1400);
      showTransitionIntro(this.app, this.app.stage, scatterCount, award, award.startMult, () => {
        Multiplier.startFreeSpin(award.startMult);
        Reels.enableFreeSpinMode(true);
        this.updateFreeSpinHUD();
        this.updateMultiplierBadges();
        setTimeout(() => this.spin(), 600);
      });
    };

    // Re-render tier buttons every time modal opens so cost reflects current bet.
    const renderTiers = () => {
      tierList.innerHTML = '';
      BUY_FEATURE_OPTIONS.forEach((opt) => {
        const cost = this.state.bet * opt.costMult;
        const award = FREE_SPIN_AWARDS[opt.scatterCount];
        const spins = award ? award.spins : '?';
        const tierBtn = document.createElement('button');
        tierBtn.className = `buy-tier tier-${opt.tier}`;
        const canAfford = this.state.balance >= cost;
        if (!canAfford) tierBtn.disabled = true;
        tierBtn.innerHTML = `
          <div>
            <span class="tier-label">${opt.label}</span>
            <span class="tier-sub">${opt.scatterCount} SCATTER · ${spins} PUTARAN</span>
          </div>
          <span class="tier-cost">${fmtMoney(cost)}</span>
        `;
        tierBtn.addEventListener('click', () => {
          if (FreeSpin.active || Reels.spinning) return;
          if (this.state.balance < cost) {
            alert(`Saldo tidak cukup untuk ${opt.label} (perlu ${fmtMoney(cost)}).`);
            return;
          }
          this.state.balance -= cost;
          this.updateHUD();
          this.savePlayerPrefs();
          modal.classList.add('hidden');
          triggerBuyFS(opt.scatterCount);
        });
        tierList.appendChild(tierBtn);
      });
    };

    btn.addEventListener('click', () => {
      if (FreeSpin.active) return;
      renderTiers();
      modal.classList.remove('hidden');
    });
    cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  },

  setTurbo(level) {
    this.state.turbo = Math.max(0, Math.min(5, level | 0));
    const btn = document.getElementById('btn-turbo');
    btn.classList.toggle('active-toggle', this.state.turbo > 0);
    const lbl = btn.querySelector('label');
    if (lbl) lbl.textContent = this.state.turbo === 0 ? 'TURBO' : `TURBO ${this.state.turbo}×`;
    this.savePlayerPrefs();
  },

  wirePickers() {
    const turboBtn = document.getElementById('btn-turbo');
    const autoBtn = document.getElementById('btn-auto');
    const turboPop = document.getElementById('turbo-popup');
    const autoPop = document.getElementById('auto-popup');

    const closePopups = () => {
      turboPop.classList.add('hidden');
      autoPop.classList.add('hidden');
    };
    const togglePopup = (pop) => {
      const wasOpen = !pop.classList.contains('hidden');
      closePopups();
      if (!wasOpen) pop.classList.remove('hidden');
    };

    // Turbo button → toggle popup; sync active state
    turboBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Audio.uiTap?.(1.4);
      // Refresh active marker
      turboPop.querySelectorAll('.picker-opt').forEach(o => {
        o.classList.toggle('active', parseInt(o.dataset.turbo, 10) === this.state.turbo);
      });
      togglePopup(turboPop);
    });
    turboPop.querySelectorAll('.picker-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        Audio.uiTap?.(1.0);
        this.setTurbo(parseInt(opt.dataset.turbo, 10));
        closePopups();
      });
    });

    // Auto button — if currently auto-spinning, click stops it; else show popup
    autoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Audio.uiTap?.(1.4);
      if (this.state.autoSpinning) {
        this.toggleAuto(); // stop
        return;
      }
      togglePopup(autoPop);
    });
    autoPop.querySelectorAll('.picker-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        Audio.uiTap?.(1.1);
        const count = parseInt(opt.dataset.auto, 10);
        // Override autoConfig: no stop conditions, just count
        this.state.autoConfig.count = count;
        this.state.autoConfig.stopOnFreeSpin = false;
        this.state.autoConfig.stopOnBigWin = false;
        this.state.autoConfig.stopOnWinAboveBet = 0;
        this.saveAutoConfig();
        closePopups();
        this.toggleAuto(); // start
      });
    });

    // Click outside → close popups
    document.addEventListener('click', (e) => {
      if (!turboPop.contains(e.target) && e.target !== turboBtn &&
          !autoPop.contains(e.target)  && e.target !== autoBtn) {
        closePopups();
      }
    });
  },

  toggleAuto() {
    if (this.state.autoSpinning) {
      this.state.autoSpinning = false;
      this.state.autoRemaining = 0;
      document.getElementById('btn-auto').classList.remove('active-toggle');
      this.updateAutoLabel();
      return;
    }
    this.state.autoSpinning = true;
    this.state.autoRemaining = this.state.autoConfig.count || -1; // -1 = infinite
    this.state.autoTotal = this.state.autoConfig.count || -1;     // I.3 track total for progress ring
    document.getElementById('btn-auto').classList.add('active-toggle');
    this.updateAutoLabel();
    this.autoLoop();
  },

  updateAutoLabel() {
    const lbl = document.querySelector('#btn-auto label');
    if (!lbl) return;
    if (this.state.autoSpinning) {
      lbl.textContent = this.state.autoRemaining < 0 ? '∞' : String(this.state.autoRemaining);
    } else {
      lbl.textContent = 'AUTO';
    }
    // I.3 — update CSS variable --auto-progress (ratio 0-1) for progress ring
    const btn = document.getElementById('btn-auto');
    if (btn) {
      if (!this.state.autoSpinning) {
        btn.style.removeProperty('--auto-progress');
      } else if ((this.state.autoTotal || 0) <= 0) {
        btn.style.setProperty('--auto-progress', '1'); // infinite: full ring
      } else {
        const ratio = Math.max(0, Math.min(1, this.state.autoRemaining / this.state.autoTotal));
        btn.style.setProperty('--auto-progress', String(ratio));
      }
    }
  },

  async autoLoop() {
    const cfg = this.state.autoConfig;
    while (this.state.autoSpinning) {
      if (this.state.autoRemaining === 0) break;
      if (!FreeSpin.active && this.state.balance < this.state.bet) break;

      const winBefore = this.state.stats.totalWin;
      const wasInBonus = FreeSpin.active;
      await this.spin();
      const winThisSpin = this.state.stats.totalWin - winBefore;

      // Decrement counter (skip during free-spin bonus so user gets full bonus run)
      if (!wasInBonus && this.state.autoRemaining > 0) {
        this.state.autoRemaining -= 1;
        this.updateAutoLabel();
      }

      // Stop conditions
      if (cfg.stopOnFreeSpin && FreeSpin.active && !wasInBonus) break;
      if (cfg.stopOnWinAboveBet > 0 && winThisSpin >= this.state.bet * cfg.stopOnWinAboveBet) break;
      if (cfg.stopOnBigWin && winThisSpin >= this.state.bet * WIN_TIERS.BIG.min) break;

      await new Promise(r => setTimeout(r, 400));
    }
    this.state.autoSpinning = false;
    this.state.autoRemaining = 0;
    document.getElementById('btn-auto').classList.remove('active-toggle');
    this.updateAutoLabel();
  },

  // Smooth integer counter animation with ease-out. Used for balance/win rolling.
  _animateCounter(el, fromVal, toVal, duration, fmt = fmtMoney) {
    if (!el) return;
    // Cancel any in-flight animation on same element
    if (el._counterRaf) cancelAnimationFrame(el._counterRaf);
    if (fromVal === toVal) { el.textContent = fmt(toVal); return; }
    const start = performance.now();
    const diff = toVal - fromVal;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      el.textContent = fmt(fromVal + diff * eased);
      if (t < 1) el._counterRaf = requestAnimationFrame(tick);
      else el._counterRaf = null;
    };
    el._counterRaf = requestAnimationFrame(tick);
  },

  // Idle Attract: schedules a gold pulse on the spin button after 10s of no input.
  // Cleared on any user interaction or game-busy state.
  _IDLE_MS: 10000,
  _resetIdleTimer() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    const spinBtn = document.getElementById('btn-spin');
    if (spinBtn) spinBtn.classList.remove('idle-attract');
    // Only schedule if game is in idle state (not spinning, not in FS auto-chain, no modal)
    this._idleTimer = setTimeout(() => {
      if (!this.app) return;
      if (Reels.spinning) return;
      if (this.state.autoSpinning) return;
      const modalOpen = !document.getElementById('menu-modal')?.classList.contains('hidden')
        || !document.getElementById('info-modal')?.classList.contains('hidden')
        || !document.getElementById('admin-panel')?.classList.contains('hidden');
      if (modalOpen) return;
      if (spinBtn && !spinBtn.disabled) spinBtn.classList.add('idle-attract');
    }, this._IDLE_MS);
  },
  _wireIdleAttract() {
    // Listen for any user input → reset
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(ev => {
      document.addEventListener(ev, () => this._resetIdleTimer(), { passive: true });
    });
    // Initial schedule
    this._resetIdleTimer();
  },

  // Show a styled dialog when player tries to spin but balance < bet.
  // Offers: auto-lower bet to affordable level, or top-up via admin (for dev/social casino).
  _showInsufficientBalanceDialog() {
    // If a lower bet level is affordable, suggest auto-lower.
    const affordableIdx = GAME_CONFIG.BET_LEVELS.findIndex(b => b <= this.state.balance);
    const canLower = affordableIdx >= 0 && affordableIdx < this.state.betIdx;
    const msg = canLower
      ? `Saldo (Rp ${fmtMoney(this.state.balance)}) tidak cukup untuk bet Rp ${fmtMoney(this.state.bet)}.\n\nKlik OK untuk turunkan bet otomatis ke Rp ${fmtMoney(GAME_CONFIG.BET_LEVELS[affordableIdx])}, atau Cancel untuk top-up via admin.`
      : `Saldo Rp ${fmtMoney(this.state.balance)} tidak cukup untuk bet minimum Rp ${fmtMoney(GAME_CONFIG.BET_LEVELS[0])}.\n\nKlik OK untuk top-up saldo via admin.`;
    const ok = confirm(msg);
    if (ok && canLower) {
      this.state.betIdx = affordableIdx;
      this.state.bet = GAME_CONFIG.BET_LEVELS[affordableIdx];
      this.updateHUD();
      this.savePlayerPrefs();
    } else if (ok && !canLower) {
      // Open admin panel to top up
      document.getElementById('admin-panel')?.classList.remove('hidden');
      if (this._adminRefresh) this._adminRefresh();
    }
  },

  updateHUD() {
    const balEl = document.getElementById('balance');
    const betEl = document.getElementById('bet');
    if (balEl) {
      const cur = parseInt((balEl.textContent || '0').replace(/\D/g, ''), 10) || 0;
      const target = Math.floor(this.state.balance);
      // Brief flash class when balance increases (cleanup auto)
      if (target > cur) {
        balEl.classList.remove('balance-up');
        void balEl.offsetWidth;
        balEl.classList.add('balance-up');
        setTimeout(() => balEl.classList.remove('balance-up'), 1200);
      }
      this._animateCounter(balEl, cur, target, 700);
    }
    if (betEl) {
      // Saat Ante Bet ON, tampilkan effective bet supaya pemain tahu jumlah
      // yang sebenarnya dipotong tiap spin. Tetap base bet kalau OFF.
      const displayBet = this.state.anteBet ? this.effectiveBet() : this.state.bet;
      betEl.textContent = fmtMoney(displayBet);
      betEl.classList.toggle('bet-ante-on', !!this.state.anteBet);
    }
  },

  // Dramatic win display: rolls 0 → amount, pulses, color-shifts on big wins.
  // Called after each cascade win settles. tier from WinCelebration.determineTier.
  displayWin(amount, tier) {
    const el = document.getElementById('win');
    if (!el) return;
    el.classList.remove('win-pulse', 'win-big', 'win-mega', 'win-epic', 'win-legendary');
    if (amount <= 0) { el.textContent = '0'; return; }
    const dur = tier === 'LEGENDARY' ? 2200 : tier === 'EPIC' ? 1600 : tier === 'MEGA' ? 1200 : tier === 'BIG' ? 900 : 600;
    this._animateCounter(el, 0, Math.floor(amount), dur);
    // Add tier class for color/glow distinction
    if (tier === 'LEGENDARY') el.classList.add('win-legendary');
    else if (tier === 'EPIC') el.classList.add('win-epic');
    else if (tier === 'MEGA') el.classList.add('win-mega');
    else if (tier === 'BIG') el.classList.add('win-big');
    // Pulse trigger (after a tiny delay so transition reads)
    void el.offsetWidth;
    el.classList.add('win-pulse');
  },

  handleResize() {
    // FIXED VIRTUAL CANVAS APPROACH:
    // Game di-init SEKALI di awal pada ukuran viewport saat itu (initial size).
    // Pada resize, kita TIDAK rebuild apapun — cuma resize renderer + scale stage
    // proporsional supaya content yang udah ter-render fit ke viewport baru.
    // Hasil: simbol TIDAK pernah berubah bentuk/posisi internal, cuma di-zoom in/out.
    const cp = document.getElementById('pixi-canvas');
    const w = cp.clientWidth, h = cp.clientHeight;

    // Resize renderer ke ukuran viewport sekarang
    this.app.renderer.resize(w, h);

    // Simpan ukuran initial pertama kali (sebagai virtual reference)
    if (!this._virtualSize) {
      this._virtualSize = { w, h };
      return; // first call, no scale needed
    }
    const { w: vw, h: vh } = this._virtualSize;

    // Hitung scale yang fit viewport while maintaining aspect ratio
    const scale = Math.min(w / vw, h / vh);
    this.app.stage.scale.set(scale);

    // Center the scaled stage in new viewport
    this.app.stage.x = (w - vw * scale) / 2;
    this.app.stage.y = (h - vh * scale) / 2;
  },
};

const LOGIN_KEY = 'calavera_user';
// OPEN LOGIN MODE: Any non-empty username + any password accepted.
// Each unique username gets its own balance + settings (stored per-user
// via localStorage keys keyed by username).
// VALID_USER/VALID_PASS kept ONLY for the hidden admin dev panel login.
const VALID_USER = 'admin';
const VALID_PASS = 'admin123';

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-menu').classList.add('hidden');
  // Ensure audio engine ready and start login ambient music on first user interaction
  Audio.init();
  startLoginMusicOnFirstInteraction();
}
function showMainMenu() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-menu').classList.remove('hidden');
  // Crossfade: stop login music quickly, start menu music after short gap
  Audio.stopLoginMusic?.(500);
  Audio.init();
  startMenuMusicOnFirstInteraction();
}

let _menuMusicArmed = false;
function startMenuMusicOnFirstInteraction() {
  if (_menuMusicArmed) {
    // Audio context might already be running — start immediately
    if (Audio.ctx && Audio.ctx.state === 'running') {
      setTimeout(() => Audio.playMenuMusic?.(), 700);
    }
    return;
  }
  _menuMusicArmed = true;
  // If audio context already unlocked (came from login click), start with small delay
  if (Audio.ctx && Audio.ctx.state === 'running') {
    setTimeout(() => Audio.playMenuMusic?.(), 700);
    return;
  }
  const start = () => {
    setTimeout(() => Audio.playMenuMusic?.(), 200);
    document.removeEventListener('pointerdown', start);
    document.removeEventListener('keydown', start);
  };
  document.addEventListener('pointerdown', start, { once: true });
  document.addEventListener('keydown', start, { once: true });
}

let _loginMusicArmed = false;
function startLoginMusicOnFirstInteraction() {
  if (_loginMusicArmed) return;
  _loginMusicArmed = true;
  const start = () => {
    Audio.playLoginMusic?.();
    document.removeEventListener('pointerdown', start);
    document.removeEventListener('keydown', start);
  };
  document.addEventListener('pointerdown', start, { once: true });
  document.addEventListener('keydown', start, { once: true });
}

/* ============ LOGIN IDLE ATTRACT ============ */
let _idleTimer = null;
const IDLE_MS = 5000;
function setupLoginAttract() {
  const attract = document.getElementById('login-attract');
  if (!attract) return;
  const loginScreen = document.getElementById('login-screen');

  const showAttract = () => {
    // Only show if still on login screen
    if (loginScreen.classList.contains('hidden')) return;
    attract.classList.remove('hidden', 'fade-out');
  };
  const hideAttract = () => {
    if (attract.classList.contains('hidden')) return;
    attract.classList.add('fade-out');
    setTimeout(() => attract.classList.add('hidden'), 450);
  };
  const resetIdle = () => {
    hideAttract();
    if (_idleTimer) clearTimeout(_idleTimer);
    // Only schedule next attract if login still visible
    if (!loginScreen.classList.contains('hidden')) {
      _idleTimer = setTimeout(showAttract, IDLE_MS);
    }
  };

  // Listen for any user activity on login screen
  ['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach(ev => {
    document.addEventListener(ev, () => {
      if (!loginScreen.classList.contains('hidden')) resetIdle();
    }, { passive: true });
  });

  // Also hide when login finishes (user logs in successfully)
  // Kick off first idle timer
  resetIdle();
}
function hideLoginAndStart() {
  // Now: after login, show main menu instead of immediately starting game
  showMainMenu();
}
async function startGame() {
  document.getElementById('main-menu').classList.add('hidden');
  // Stop menu music when entering game
  Audio.stopMenuMusic?.(500);
  // Show splash overlay
  showSplash();
  try {
    if (!Game.app) {
      await Game.init();
    }
  } catch (e) {
    console.error('[startGame] init error', e);
  }
  // Ensure splash is visible at least 2.2s for smooth UX (so player has time to
  // read tagline + tip + see branding animation, instead of an instant flash).
  await new Promise(r => setTimeout(r, 2200));
  hideSplash();
}

// Rotating tips shown at the bottom of the splash screen — each ~3.5s, lifecycle
// stops when splash gets hidden.
const SPLASH_TIPS = [
  '💡 Simbol berbingkai emas akan berubah jadi WILD setelah menang!',
  '🎯 Tekan TURBO 5× untuk spin paling cepat.',
  '⭐ 3 simbol Peti Mati = 12 putaran gratis dengan multiplier tumbuh.',
  '🎰 Ante Bet ON → 2× peluang scatter, +25% taruhan.',
  '💎 Multiplier reset ke ×1 di awal setiap spin (base game).',
  '🔥 Mode MEGA BELI langsung kasih 5 scatter equivalent!',
  '🎺 Setiap cascade beruntun naikkan multiplier — semakin panjang, semakin BESAR!',
  '🌟 Maks 1024 cara menang setiap spin dari kiri ke kanan.',
];
let _splashTipTimer = null;
function startSplashTipRotation() {
  const el = document.getElementById('splash-tip');
  if (!el) return;
  let i = Math.floor(Math.random() * SPLASH_TIPS.length);
  el.textContent = SPLASH_TIPS[i];
  if (_splashTipTimer) clearInterval(_splashTipTimer);
  _splashTipTimer = setInterval(() => {
    el.style.opacity = '0';
    setTimeout(() => {
      i = (i + 1) % SPLASH_TIPS.length;
      el.textContent = SPLASH_TIPS[i];
      el.style.opacity = '1';
    }, 350);
  }, 3500);
}
function stopSplashTipRotation() {
  if (_splashTipTimer) { clearInterval(_splashTipTimer); _splashTipTimer = null; }
}

function showSplash() {
  const s = document.getElementById('splash-screen');
  if (!s) return;
  s.classList.remove('hidden', 'fade-out');
  setSplashProgress(0);
  startSplashTipRotation();
}
function hideSplash() {
  const s = document.getElementById('splash-screen');
  if (!s) return;
  setSplashProgress(100);
  s.classList.add('fade-out');
  stopSplashTipRotation();
  setTimeout(() => { s.classList.add('hidden'); s.classList.remove('fade-out'); }, 650);
}
function setSplashProgress(pct) {
  const bar = document.getElementById('splash-progress-bar');
  const label = document.getElementById('splash-progress-label');
  if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (label) label.textContent = Math.round(pct) + '%';
}
// Expose for game's preload to update progress
window.__setSplashProgress = setSplashProgress;
function attemptLogin() {
  const userEl = document.getElementById('login-user');
  const passEl = document.getElementById('login-pass');
  const errEl = document.getElementById('login-error');
  let user = userEl.value.trim();
  // OPEN LOGIN: accept any non-empty username; password ignored entirely.
  // Sanitize username: alphanumeric + dash/underscore only, max 24 chars.
  user = user.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24);
  if (!user) {
    errEl.textContent = 'Username tidak boleh kosong!';
    userEl.focus();
    return;
  }
  // Save active user — game state will key off this for per-user balance/settings
  localStorage.setItem(LOGIN_KEY, user);
  errEl.textContent = '';
  hideLoginAndStart();
}
function setupLoginUI() {
  document.getElementById('btn-login').addEventListener('click', attemptLogin);
  document.getElementById('login-user').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-pass').focus(); });
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    if (confirm('Logout sekarang?')) {
      localStorage.removeItem(LOGIN_KEY);
      location.reload();
    }
  });
  // Gear button on login screen opens the admin/settings panel
  const loginGear = document.getElementById('login-settings-btn');
  if (loginGear) loginGear.addEventListener('click', () => {
    document.getElementById('admin-panel').classList.remove('hidden');
    if (Game._adminRefresh) Game._adminRefresh();
  });
}

function setupMainMenuUI() {
  const verEl = document.getElementById('menu-version');
  if (verEl) verEl.textContent = GAME_VERSION;
  const play = document.getElementById('menu-play');
  const settings = document.getElementById('menu-settings');
  const quit = document.getElementById('menu-quit');
  const paytable = document.getElementById('menu-paytable');
  const jackpot = document.getElementById('menu-jackpot');
  const installBtn = document.getElementById('pwa-install-btn');

  // PWA install button — show prompt that was captured at beforeinstallprompt
  if (installBtn) installBtn.addEventListener('click', async () => {
    const p = window.__pwaInstallPrompt;
    if (!p) return;
    p.prompt();
    const choice = await p.userChoice;
    if (choice.outcome === 'accepted') {
      installBtn.classList.add('hidden');
    }
    window.__pwaInstallPrompt = null;
  });

  if (play) play.addEventListener('click', () => startGame());
  if (settings) settings.addEventListener('click', () => {
    document.getElementById('admin-panel').classList.remove('hidden');
    if (Game._adminRefresh) Game._adminRefresh();
  });
  if (quit) quit.addEventListener('click', () => {
    if (!confirm('Keluar dari game? (Logout)')) return;
    localStorage.removeItem(LOGIN_KEY);
    location.reload();
  });

  // PERATURAN: open paytable (need game initialized for info modal to render)
  if (paytable) paytable.addEventListener('click', () => {
    if (!Game.app) Game.init();
    Game.togglePaytable?.();
  });

  // JACKPOT: open styled modal
  const jackpotModal = document.getElementById('jackpot-modal');
  const jackpotCloseModal = () => jackpotModal?.classList.add('hidden');
  if (jackpot) jackpot.addEventListener('click', () => jackpotModal?.classList.remove('hidden'));
  document.getElementById('jackpot-close')?.addEventListener('click', jackpotCloseModal);
  document.getElementById('jackpot-ok')?.addEventListener('click', jackpotCloseModal);
  jackpotModal?.addEventListener('click', (e) => {
    if (e.target === jackpotModal) jackpotCloseModal();
  });
}

// DEVICE TIER DETECTION (runs at script load, BEFORE Game.init).
// Set CSS class on <html> so styles work even on login screen / before game opens.
// Tier LOW:  Samsung A06/A05/A04, Redmi 12C, Infinix Hot (4GB RAM, MediaTek)
// Tier MID:  Samsung A14/A24/A34, Redmi Note 11/12, Oppo A78
// Tier HIGH: Samsung S22+, iPhone 13+, Xiaomi 13+
// Tier PC:   Desktop (no touch)
(function detectDeviceTier() {
  const hasTouch = (navigator?.maxTouchPoints || 0) > 0;
  const isMobileViewport = window.innerWidth < 900;
  const isMobile = (window.matchMedia?.('(hover: none) and (pointer: coarse)').matches) || (hasTouch && isMobileViewport);
  let tier = 'pc';
  if (isMobile) {
    const cores = navigator.hardwareConcurrency || 4;
    const ram = navigator.deviceMemory || 4;
    const ua = (navigator.userAgent || '').toLowerCase();
    const isBudgetSamsung = /sm-a06|sm-a05|sm-a04|sm-a03|sm-a02|sm-a01/i.test(navigator.userAgent);
    const isMediatek = /mt67|mt68|mediatek|helio/i.test(ua);
    if (isBudgetSamsung || ram <= 3 || cores <= 4 || isMediatek) tier = 'low';
    else if (ram >= 8 && cores >= 8) tier = 'high';
    else tier = 'mid';
  }
  window.__DEVICE_TIER__ = tier;
  document.documentElement.classList.add(`tier-${tier}`);
  if (isMobile) document.documentElement.classList.add('is-mobile');
  // Browser detection for CSS targeting
  const ua = navigator.userAgent || '';
  if (/SamsungBrowser/i.test(ua)) document.documentElement.classList.add('browser-samsung');
  if (/CriOS|Chrome\/[\d.]+ Mobile Safari/i.test(ua) && /iPhone|iPad|iPod/i.test(ua)) document.documentElement.classList.add('browser-ios');
  if (/MiuiBrowser|XiaoMi/i.test(ua)) document.documentElement.classList.add('browser-miui');
  console.log(`[device] tier=${tier} isMobile=${isMobile} cores=${navigator.hardwareConcurrency} ram=${navigator.deviceMemory}GB`);
})();

// JS-based game-container scale: works on ALL mobile browsers (Samsung Browser,
// older Chrome Android, etc) where CSS calc(min(viewport units)) might fail silently.
// Computes scale based on viewport dimensions and sets CSS variable --game-scale.
function updateGameContainerScale() {
  const designW = 577;
  const designH = 950;
  const margin = 20;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scaleW = (vw - margin) / designW;
  const scaleH = (vh - margin) / designH;
  const scale = Math.min(scaleW, scaleH);
  document.documentElement.style.setProperty('--game-scale', scale.toFixed(4));
}
// Run on load + every resize + orientation change
window.addEventListener('resize', updateGameContainerScale);
window.addEventListener('orientationchange', updateGameContainerScale);
// Initial call ASAP (before DOM load) and again after load to handle browser chrome
updateGameContainerScale();
document.addEventListener('DOMContentLoaded', updateGameContainerScale);

window.addEventListener('load', () => {
  // Ensure scale is correct after full load (URL bar may have collapsed)
  updateGameContainerScale();
  setTimeout(updateGameContainerScale, 100);
  // 1. Preload persisted settings so panel reflects them before any binding
  Game.prebootSettings();
  // 2. Wire admin panel listeners (safe — defensive checks for non-init state)
  Game.wireAdmin();
  // 3. Login + main menu UI
  setupLoginUI();
  setupMainMenuUI();
  setupLoginAttract();
  // OPEN LOGIN: any saved username = auto-resume to main menu
  const savedUser = localStorage.getItem(LOGIN_KEY);
  if (savedUser && savedUser.trim()) {
    showMainMenu();
  } else {
    showLogin();
    document.getElementById('login-user').focus();
  }
  // 4. PWA: register service worker for offline play + installable.
  //    Only in production builds (dev mode bypasses SW for HMR to work).
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[PWA] Service worker registered, scope:', reg.scope);
        // Detect new version available, prompt update
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New version available — refresh to update');
            }
          });
        });
      })
      .catch((err) => console.warn('[PWA] SW register failed:', err));
  }
  // 5. PWA install prompt (Chrome/Edge/Android): capture event for custom UI
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__pwaInstallPrompt = e;
    // Show install button if app not already installed
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    window.__pwaInstallPrompt = null;
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.classList.add('hidden');
    console.log('[PWA] App installed to home screen');
  });
});
