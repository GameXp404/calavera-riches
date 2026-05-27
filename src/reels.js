import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import { GlowFilter } from '@pixi/filter-glow';
import { GodrayFilter } from '@pixi/filter-godray';
import { GAME_CONFIG, SYMBOLS, REEL_WEIGHTS, ASSET_PATH, ANTE_BET_SCATTER_BOOST } from './config.js';
import { Difficulty } from './difficulty.js';
import { Audio } from './audio.js';
import { isWild, isScatter } from './ways.js';

const SCATTER_ID = 'COFFIN';
const WILD_ID = 'CATRINA';
// Per-symbol idle animation config — match WB "subtle breathing" feel.
// Tweens inner sprite.scale (NOT container.scale) so it does NOT conflict
// with cascade/win cell scale tweens that target the container.
// COFFIN excluded — handled separately by startScatterPulse + video texture.
const IDLE_ANIM = {
  MARIACHI: { scaleAmp: 0.040, dur: 2.0, ease: 'sine.inOut' }, // top symbol — most prominent
  GUITAR:   { scaleAmp: 0.030, dur: 2.4, ease: 'sine.inOut' },
  SKULL:    { scaleAmp: 0.035, dur: 2.2, ease: 'sine.inOut' },
  MARACAS:  { scaleAmp: 0.025, dur: 2.6, ease: 'sine.inOut', rotAmp: 0.025 }, // gentle sway
  CATRINA:  { scaleAmp: 0.045, dur: 2.8, ease: 'sine.inOut', alphaAmp: 0.10 }, // wild glow
};

// Apply idle breathing tween to the inner image sprite of a premium symbol.
// Called from createSymbol AFTER fit scale is set so we know baseScale.
// Random per-instance delay so all symbols don't pulse in sync (organic feel).
// Tween auto-killed via killSymbolTweens (it walks sprite.children and kills tweens).
// PERF: skip idle animations on mid/low tier mobile (saves 5-15% CPU).
// HIGH tier (flagships) still gets the breathing for premium feel.
function _skipIdleAnim() {
  if (typeof document === 'undefined') return false;
  const cls = document.documentElement.className;
  return cls.includes('tier-low') || cls.includes('tier-mid');
}

function applyIdleAnim(sprite, symId, baseScale) {
  // Low/mid mobile: skip idle breathing/sway completely
  if (_skipIdleAnim()) return;
  const cfg = IDLE_ANIM[symId];
  if (!cfg || !sprite || sprite.destroyed) return;
  const delay = Math.random() * cfg.dur * 0.7; // de-sync starts
  const ampScale = baseScale * cfg.scaleAmp;
  // Scale breathing
  gsap.to(sprite.scale, {
    x: baseScale + ampScale,
    y: baseScale + ampScale,
    duration: cfg.dur,
    repeat: -1,
    yoyo: true,
    ease: cfg.ease,
    delay,
  });
  // Optional rotation sway (for MARACAS)
  if (cfg.rotAmp) {
    gsap.to(sprite, {
      rotation: cfg.rotAmp,
      duration: cfg.dur * 1.15,
      repeat: -1,
      yoyo: true,
      ease: cfg.ease,
      delay: delay * 0.6,
    });
  }
  // Optional alpha pulse (for CATRINA Wild — gold glow vibe)
  if (cfg.alphaAmp) {
    gsap.to(sprite, {
      alpha: 1 - cfg.alphaAmp,
      duration: cfg.dur * 0.9,
      repeat: -1,
      yoyo: true,
      ease: cfg.ease,
      delay,
    });
  }
}

// G3 — Gold shimmer helper: brief gold→white tint flash (cascade fill arrival).
// createSymbol returns a Container; we walk and tint all child Sprites for full-symbol flash.
// Interpolates RGB from #ffd86b (gold) to #ffffff (white) over duration, then restores.
function shimmerSymbol(spriteOrContainer, duration = 0.4) {
  if (!spriteOrContainer || spriteOrContainer.destroyed) return;
  const targets = [];
  function collect(obj) {
    if (!obj || obj.destroyed) return;
    if (obj instanceof PIXI.Sprite) {
      targets.push({ sprite: obj, origTint: obj.tint });
    }
    if (obj.children) obj.children.forEach(collect);
  }
  collect(spriteOrContainer);
  if (targets.length === 0) return;
  // Apply gold tint to all targets
  targets.forEach(t => { t.sprite.tint = 0xffd86b; });
  const obj = { progress: 0 };
  gsap.to(obj, {
    progress: 1,
    duration,
    ease: 'power2.out',
    onUpdate: () => {
      const t = obj.progress;
      const g = Math.round(216 + (255 - 216) * t);
      const b = Math.round(107 + (255 - 107) * t);
      const newTint = (255 << 16) | (g << 8) | b;
      targets.forEach(tt => { if (!tt.sprite.destroyed) tt.sprite.tint = newTint; });
    },
    onComplete: () => {
      targets.forEach(tt => { if (!tt.sprite.destroyed) tt.sprite.tint = tt.origTint; });
    },
  });
}

export const Reels = {
  app: null,
  reelContainer: null,
  reels: [],
  grid: [],
  symbolSize: 0,
  spinning: false,
  godrayFilter: null,
  freeSpinMode: false,
  _tickerCb: null,

  async loadCoffinSheet() {
    // PRIORITY 1: video file (mp4/webm). PIXI uses HTML5 <video> as texture source,
    // auto-loops, hardware-decoded. Falls back to sprite-sheet if not found.
    const videoUrl = '/assets/img/coffin.png.mp4';
    try {
      const resp = await fetch(videoUrl, { method: 'HEAD' });
      if (resp.ok) {
        const v = document.createElement('video');
        v.src = videoUrl;
        v.loop = true;
        v.muted = true;
        v.autoplay = true;
        v.playsInline = true;
        v.crossOrigin = 'anonymous';
        // Wait for video metadata so size is known before PIXI uses it
        await new Promise((resolve, reject) => {
          v.addEventListener('loadeddata', resolve, { once: true });
          v.addEventListener('error', reject, { once: true });
          setTimeout(reject, 4000);
        });
        v.play().catch(() => {});
        this._coffinVideo = v;
        this._coffinVideoTex = PIXI.Texture.from(v);
        return;
      }
    } catch (e) {
      /* coffin.mp4 fallback chain — silent, expected design pattern */
    }

    // PRIORITY 2: sprite-sheet PNG (horizontal strip, 12 equal frames)
    const FRAMES = 12;
    const url = '/assets/img/coffin_sheet.png';
    try {
      const baseTex = await PIXI.Assets.load(url);
      const bt = baseTex.baseTexture;
      const frameW = bt.realWidth / FRAMES;
      const frameH = bt.realHeight;
      const frames = [];
      for (let i = 0; i < FRAMES; i++) {
        frames.push(new PIXI.Texture(bt, new PIXI.Rectangle(i * frameW, 0, frameW, frameH)));
      }
      this._coffinFrames = frames;
    } catch (e) {
      /* sprite sheet fallback — silent, falls back to static coffin.png */
      this._coffinFrames = null;
    }
  },

  init(app, parent) {
    // CLEANUP on re-init (resize): remove old ticker callback, old burst texture, pause old coffin video.
    // Without this, every resize adds another ticker + leaks GPU memory + leaves video decoding.
    if (this.app?.ticker && this._tickerCb) {
      this.app.ticker.remove(this._tickerCb);
      this._tickerCb = null;
    }
    if (this._burstTexture) {
      try { this._burstTexture.destroy(true); } catch {}
      this._burstTexture = null;
    }
    if (this._coffinVideo) {
      try { this._coffinVideo.pause(); } catch {}
    }
    this.app = app;
    this.reels = [];
    // Try to load animated coffin sheet (non-blocking, fallback to static)
    this.loadCoffinSheet();

    const W = app.screen.width;
    const H = app.screen.height;
    const padding = 8;
    this.symbolSize = Math.min(
      (W - padding * 2) / GAME_CONFIG.REELS,
      (H - padding * 2) / GAME_CONFIG.ROWS
    );

    this.reelContainer = new PIXI.Container();
    const gridW = this.symbolSize * GAME_CONFIG.REELS;
    const gridH = this.symbolSize * GAME_CONFIG.ROWS;
    this.reelContainer.x = (W - gridW) / 2;
    this.reelContainer.y = (H - gridH) / 2;
    parent.addChild(this.reelContainer);

    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRect(0, 0, gridW, gridH);
    mask.endFill();
    this.reelContainer.addChild(mask);
    this.reelContainer.mask = mask;

    this.godrayFilter = new GodrayFilter({
      angle: 30, gain: 0.4, lacunarity: 2.5, time: 0, parallel: true, center: [W / 2, 0],
    });

    for (let r = 0; r < GAME_CONFIG.REELS; r++) {
      const reel = { symbols: [], container: new PIXI.Container() };
      reel.container.x = r * this.symbolSize;
      reel.container.y = 0;
      this.reelContainer.addChild(reel.container);

      for (let row = 0; row < GAME_CONFIG.ROWS; row++) {
        const symId = this.randomSymbol(r);
        const sprite = this.createSymbol(symId);
        sprite.y = row * this.symbolSize;
        reel.container.addChild(sprite);
        reel.symbols.push({ sprite, id: symId, _breathing: false });
      }
      this.reels.push(reel);
    }

    this.updateGrid();
    this.startIdleBreathing();

    if (this.app.ticker) {
      this._tickerCb = () => {
        if (this.godrayFilter && this.freeSpinMode) this.godrayFilter.time += 0.005;
      };
      this.app.ticker.add(this._tickerCb);
    }
  },

  enableFreeSpinMode(enable) {
    this.freeSpinMode = enable;
    // Godray filter disabled — was causing black bars around reels due to
    // filter padding rendering opaque-black instead of transparent.
    // Free spin "feel" maintained via gold badge + multiplier UI.
    if (!this.reelContainer) return;
    this.reelContainer.filters = null;
  },

  startIdleBreathing() {
    // disabled to fix flicker — symbols stay static after drop
    return;
  },

  startScatterPulse() {
    // If video or AnimatedSprite is in use for SCATTER, skip — animation handled there.
    if (this._coffinVideoTex || this._coffinFrames) return;
    // Pulse animation for all SCATTER (COFFIN) symbols currently on reels.
    this.reels.forEach((reel) => {
      reel.symbols.forEach((sym) => {
        if (sym.id !== SCATTER_ID) return;
        if (sym._pulseTl) return;
        const sprite = sym.sprite;
        if (!sprite || !sprite.scale) return;
        const tl = gsap.timeline({ repeat: -1, yoyo: true });
        tl.to(sprite.scale, {
          x: 1.08, y: 1.08,
          duration: 0.7,
          ease: 'sine.inOut',
        });
        sym._pulseTl = tl;
      });
    });
  },

  stopScatterPulse(sym) {
    if (sym && sym._pulseTl) {
      sym._pulseTl.kill();
      sym._pulseTl = null;
      if (sym.sprite && sym.sprite.scale) {
        sym.sprite.scale.set(1, 1);
      }
    }
  },

  // GOLD-FRAMED SYMBOLS (PG Wild Bandito signature feature)
  // Randomly highlight some symbols on reels 2/3/4 (index 1-3) with a gold border.
  // If a gold-framed symbol is part of a winning combo, that POSITION will spawn
  // a WILD (Catrina) in the next cascade — chaining bigger wins.
  GOLD_FRAME_REELS: [1, 2, 3],          // middle reels eligible
  GOLD_FRAME_CHANCE: 0.18,              // ~18% per eligible cell
  GOLD_FRAME_MAX: 3,                    // cap per spin (0-3 random)

  // Pre-compute which result cells should get gold frames. Used BEFORE spin
  // animation so the frames can fall together with the result symbols.
  // Returns 2D array [reel][row] of booleans matching allSymbols structure.
  //
  // WB SIGNATURE FREE SPIN FEATURE:
  //   During Free Spin mode, the MIDDLE REEL (index 2) is FULLY gold-framed
  //   on every spin. This guarantees wild conversions, creating powerful
  //   wild chains across cascades — the core "Free Spin payout boost" of WB.
  //   Other reels still get random gold frames (reels index 1 and 3).
  computeGoldMask(allSymbols) {
    const mask = allSymbols.map(col => col.map(() => false));

    // FREE SPIN: middle reel (index 2) ALL cells gold-framed (skip wild/scatter)
    if (this.freeSpinMode && allSymbols[2]) {
      for (let row = 0; row < allSymbols[2].length; row++) {
        const id = allSymbols[2][row];
        if (id === WILD_ID || id === SCATTER_ID) continue;
        mask[2][row] = true;
      }
    }

    // Random gold frames on REMAINING eligible reels.
    // In FS: middle reel already done — only reel 1 and 3 random.
    // In base: all 3 middle reels (index 1, 2, 3) random.
    const reelsForRandom = this.freeSpinMode ? [1, 3] : this.GOLD_FRAME_REELS;
    const eligible = [];
    for (const r of reelsForRandom) {
      if (!allSymbols[r]) continue;
      for (let row = 0; row < allSymbols[r].length; row++) {
        const id = allSymbols[r][row];
        if (id === WILD_ID || id === SCATTER_ID) continue;
        if (mask[r][row]) continue; // already gold (defensive)
        eligible.push({ reel: r, row });
      }
    }
    // Shuffle
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    // Place up to MAX with CHANCE per cell
    let placed = 0;
    for (const c of eligible) {
      if (placed >= this.GOLD_FRAME_MAX) break;
      if (Math.random() < this.GOLD_FRAME_CHANCE) {
        mask[c.reel][c.row] = true;
        placed++;
      }
    }
    return mask;
  },

  applyGoldFrames() {
    // Clear any existing gold frames first
    this.clearAllGoldFrames();
    let placed = 0;
    // Build eligible list, shuffle, take up to MAX
    const candidates = [];
    for (const reelIdx of this.GOLD_FRAME_REELS) {
      const reel = this.reels[reelIdx];
      if (!reel) continue;
      for (let row = 0; row < reel.symbols.length; row++) {
        const sym = reel.symbols[row];
        if (!sym || !sym.id) continue;
        if (sym.id === WILD_ID || sym.id === SCATTER_ID) continue;
        candidates.push({ reelIdx, row });
      }
    }
    // Shuffle candidates so distribution is varied
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const c of candidates) {
      if (placed >= this.GOLD_FRAME_MAX) break;
      if (Math.random() < this.GOLD_FRAME_CHANCE) {
        this.markGoldFrame(c.reelIdx, c.row);
        placed++;
      }
    }
  },

  markGoldFrame(reelIdx, row) {
    const sym = this.reels[reelIdx]?.symbols?.[row];
    this._applyGoldFrameToSym(sym);
  },

  // Apply gold frame visuals to a sym object directly. Uses the gold_frame.png
  // asset as a sprite overlay (replaces previous Graphics-based programmatic frame).
  // Used both by spin-time pre-application (during scroll) and post-spin marking.
  _applyGoldFrameToSym(sym) {
    if (!sym || !sym.sprite || sym.isGoldFrame) return;
    sym.isGoldFrame = true;
    const size = this.symbolSize;
    const container = sym.sprite; // PIXI.Container

    // Frame goes BEHIND inner symbol — symbol fully visible in front, frame ornaments
    // peek through symbol's transparent edges. No alpha dim on symbol.
    sym._goldDimmedChild = null;

    // FRAME: gold_frame.png sprite overlay sized to cell — G4: center pivot for symmetric scale
    const tex = PIXI.Assets.cache.get(ASSET_PATH.GOLD_FRAME) ||
                PIXI.Texture.from(ASSET_PATH.GOLD_FRAME);
    const frame = new PIXI.Sprite(tex);
    frame.anchor.set(0.5);
    frame.width = size;
    frame.height = size;
    frame.x = size / 2;
    frame.y = size / 2;

    // G4: Add gold GlowFilter (silence deprecation warning from @pixi/filter-glow internals).
    // try/finally guarantees restore even if GlowFilter constructor throws.
    const _origWarn = console.warn;
    console.warn = () => {};
    let goldGlow;
    try {
      goldGlow = new GlowFilter({
        distance: 18,
        outerStrength: 2.5,
        innerStrength: 0,
        color: 0xf39c12,
        quality: 0.5,
      });
    } finally {
      console.warn = _origWarn;
    }
    frame.filters = [goldGlow];

    // Add frame at index 0 so it renders BEHIND the symbol image (user request).
    container.addChildAt(frame, 0);
    sym._goldFrame = frame;
    sym._goldFrameGlow = goldGlow;
    sym._goldFilm = null;

    // G4: Multi-property pulse — alpha 1↔0.55 + scale 1↔1.06 + glow strength 2.5↔4.5
    // (all in sync, sine.inOut yoyo, 0.65s per direction)
    const baseScaleX = frame.scale.x;
    const baseScaleY = frame.scale.y;
    const tl = gsap.timeline({ repeat: -1, yoyo: true });
    tl.to(frame, { alpha: 0.55, duration: 0.65, ease: 'sine.inOut' }, 0);
    tl.to(frame.scale, { x: baseScaleX * 1.06, y: baseScaleY * 1.06, duration: 0.65, ease: 'sine.inOut' }, 0);
    tl.to(goldGlow, { outerStrength: 4.5, duration: 0.65, ease: 'sine.inOut' }, 0);
    sym._goldFrameTl = tl;
  },

  removeGoldFrame(sym) {
    if (!sym || !sym.isGoldFrame) return;
    if (sym._goldFrameTl) { sym._goldFrameTl.kill(); sym._goldFrameTl = null; }
    if (sym._goldFrame && sym._goldFrame.parent) {
      sym._goldFrame.parent.removeChild(sym._goldFrame);
      sym._goldFrame.destroy();
    }
    if (sym._goldFilm && sym._goldFilm.parent) {
      sym._goldFilm.parent.removeChild(sym._goldFilm);
      sym._goldFilm.destroy();
    }
    // Restore original image alpha
    if (sym._goldDimmedChild && sym._goldDimmedChild._origAlpha !== undefined) {
      sym._goldDimmedChild.alpha = sym._goldDimmedChild._origAlpha;
      delete sym._goldDimmedChild._origAlpha;
    }
    sym._goldDimmedChild = null;
    sym._goldFrame = null;
    sym._goldFilm = null;
    sym._goldFrameGlow = null; // G4
    sym.isGoldFrame = false;
  },

  // ANTICIPATION GLOW — visual effect on a reel during anticipation spin.
  // Reads PG Wild Bandito's signature: thick gold border with multi-layer glow,
  // bright yellow inner film, rotating starburst behind. Pulses for the full
  // duration so player can clearly see WHICH reels still need scatter.
  //
  // IMPORTANT: this.reelContainer is masked to gridW × gridH so symbols don't
  // spill outside the reel area during the spin scroll. If we appended the glow
  // to reel.container (a child of the masked reelContainer), the chunky outer
  // border (which extends -6..reelW+12 beyond the symbol area) would get
  // CLIPPED — only the inner film stays visible, which looks like nothing.
  // Fix: append the overlay to reelContainer.parent at the world position of
  // the target reel, so the glow renders OUTSIDE the mask.
  showAnticipationGlow(reelIdx, durationMs) {
    const reel = this.reels[reelIdx];
    if (!reel) return;
    const size = this.symbolSize;
    const reelW = size;
    const reelH = size * GAME_CONFIG.ROWS;
    const overlay = new PIXI.Container();
    // Position overlay in PARENT (unmasked) coord space.
    overlay.x = this.reelContainer.x + reelIdx * size;
    overlay.y = this.reelContainer.y;

    // Layer 1: rotating starburst rays BEHIND film (large, soft)
    const rays = new PIXI.Graphics();
    const rayCount = 24;
    const rayLength = Math.max(reelW, reelH);
    rays.beginFill(0xfbbf24, 0.18);
    for (let i = 0; i < rayCount; i++) {
      const a1 = (i / rayCount) * Math.PI * 2;
      const a2 = a1 + (Math.PI * 2 / rayCount) * 0.5;
      rays.moveTo(0, 0);
      rays.lineTo(Math.cos(a1) * rayLength, Math.sin(a1) * rayLength);
      rays.lineTo(Math.cos(a2) * rayLength, Math.sin(a2) * rayLength);
      rays.lineTo(0, 0);
    }
    rays.endFill();
    rays.x = reelW / 2; rays.y = reelH / 2;
    rays.alpha = 0;
    overlay.addChild(rays);

    // Layer 2: bright gold film (whole reel area, warm yellow tint)
    const film = new PIXI.Graphics();
    film.beginFill(0xf59e0b, 0.35);
    film.drawRect(0, 0, reelW, reelH);
    film.endFill();
    overlay.addChild(film);

    // Layer 3: vertical light STREAKS — WB signature 'cahaya panjang' that
    // streaks down through the spinning reel. Multiple narrow gradients
    // staggered so it feels like continuous falling light.
    const streakLayer = new PIXI.Container();
    streakLayer.x = 0; streakLayer.y = 0;
    // Use mask so streaks don't leak outside the reel column.
    const streakMask = new PIXI.Graphics();
    streakMask.beginFill(0xffffff);
    streakMask.drawRect(0, 0, reelW, reelH);
    streakMask.endFill();
    streakLayer.addChild(streakMask);
    streakLayer.mask = streakMask;
    const streaks = [];
    const STREAK_COUNT = 4;
    for (let i = 0; i < STREAK_COUNT; i++) {
      const streak = new PIXI.Graphics();
      // Narrow vertical light beam — bright gold to transparent ends.
      // Drawn as a tall column with multiple fade stops via stacked rects.
      const beamH = reelH * 0.55; // light tail length
      const beamW = reelW * 0.42;
      const segH = beamH / 8;
      for (let s = 0; s < 8; s++) {
        const t = s / 7; // 0 → 1 along beam
        // Brightness peaks in middle, fades at top/bottom
        const intensity = Math.sin(t * Math.PI) * 0.85;
        streak.beginFill(0xfff5d6, intensity);
        streak.drawRect(0, s * segH, beamW, segH + 1);
        streak.endFill();
      }
      streak.x = (reelW - beamW) / 2;
      streak.y = -beamH; // start above reel
      streak.alpha = 0.85;
      streakLayer.addChild(streak);
      streaks.push(streak);
    }
    overlay.addChild(streakLayer);

    // Layer 4: chunky multi-stack gold border for the WB-thick glow look
    const border = new PIXI.Graphics();
    border.lineStyle(12, 0xb91c1c, 0.65);  // outer crimson halo
    border.drawRoundedRect(-6, -6, reelW + 12, reelH + 12, 14);
    border.lineStyle(7, 0xfbbf24, 1);       // bright gold middle
    border.drawRoundedRect(-3, -3, reelW + 6, reelH + 6, 10);
    border.lineStyle(2.5, 0xffffff, 0.9);   // white inner highlight
    border.drawRoundedRect(0, 0, reelW, reelH, 8);
    overlay.addChild(border);

    overlay.alpha = 0;
    // Attach to reelContainer.parent (unmasked) so the chunky outer border
    // doesn't get clipped. Falls back to reel.container if no parent (shouldn't happen).
    const host = this.reelContainer.parent || reel.container;
    host.addChild(overlay);

    // Shared cleanup guard so timeline.onComplete and safety setTimeout don't
    // both try to destroy the overlay (would throw on second destroy).
    let cleaned = false;
    let raySpinTween = null;
    const safeCleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (raySpinTween) raySpinTween.kill();
      if (overlay.parent) overlay.parent.removeChild(overlay);
      if (!overlay.destroyed) overlay.destroy({ children: true });
    };

    // Simpler animation: snap to full alpha, run infinite pulse, kill on duration.
    overlay.alpha = 1;
    rays.alpha = 0.9;
    raySpinTween = gsap.to(rays, { rotation: Math.PI * 2, duration: 3, repeat: -1, ease: 'none' });
    // Continuous pulse (yoyo, infinite) — looks like WB's slow strobe.
    const pulseTween = gsap.to(overlay, {
      alpha: 0.55,
      duration: 0.4,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
    });

    // Light streaks: each beam falls top→bottom on a stagger so it looks like
    // continuous downward 'cahaya panjang' through the spinning reel.
    const streakTweens = [];
    const streakCycle = 0.55; // each beam takes ~0.55s to traverse
    streaks.forEach((s, i) => {
      const delay = (i / streaks.length) * streakCycle;
      // y travels from -beamH(=above) to reelH+beamH(=below) repeating.
      // PIXI mask clips so only the part inside the reel renders.
      const beamH = reelH * 0.55;
      s.y = -beamH;
      const t = gsap.to(s, {
        y: reelH + beamH,
        duration: streakCycle,
        delay,
        repeat: -1,
        ease: 'none',
      });
      streakTweens.push(t);
    });

    // Kill animations + cleanup exactly when the reel stops, after a short fade.
    setTimeout(() => {
      pulseTween.kill();
      streakTweens.forEach(t => t.kill());
      gsap.to(overlay, {
        alpha: 0,
        duration: 0.25,
        ease: 'power2.in',
        onComplete: safeCleanup,
      });
    }, Math.max(300, durationMs - 250));

    // Hard safety net in case the fade-out tween never completes.
    setTimeout(safeCleanup, durationMs + 1500);
  },

  clearAllGoldFrames() {
    for (const reel of this.reels) {
      for (const sym of reel.symbols) {
        if (sym?.isGoldFrame) this.removeGoldFrame(sym);
      }
    }
  },

  // Transform gold-framed cells that are part of winning combo INTO Wild (Catrina)
  // in-place. Frame breaks (burst animation), then symbol swapped to Wild at SAME position.
  // Returns a Set of "reel-row" keys for the converted positions so caller can
  // exclude them from removeWinningCells (wild persists this round).
  async transformGoldCellsToWild(wins) {
    const goldWinCells = [];
    const convertedKeys = new Set();
    const cellMap = new Set();
    wins.forEach(w => {
      if (w.isScatter || !w.cells) return;
      w.cells.forEach(c => cellMap.add(`${c.reel}-${c.row}`));
    });
    cellMap.forEach(key => {
      const [r, row] = key.split('-').map(Number);
      const sym = this.reels[r].symbols[row];
      if (sym?.isGoldFrame) {
        goldWinCells.push({ reel: r, row });
        convertedKeys.add(key);
      }
    });
    if (goldWinCells.length === 0) return convertedKeys;

    // STAGE 1: BURST EXPLOSION on gold-framed winning cells (before any shrink/transform).
    // Plays explosion sound + bright burst flash at each cell — the "ledakan" effect.
    const cIter = this._cascadeIter || 0;
    goldWinCells.forEach(({ reel: r, row }, idx) => {
      const sym = this.reels[r].symbols[row];
      if (!sym || !sym.sprite) return;
      const oldContainer = sym.sprite;
      const size = this.symbolSize;
      // Staggered explosion sound (50ms per cell)
      setTimeout(() => Audio.winHighlight?.(cIter), idx * 50);
      // Bright burst at cell center (additive blend, expanding flash)
      if (oldContainer.parent) {
        const burst = new PIXI.Sprite(this._getBurstTexture());
        burst.anchor.set(0.5);
        burst.x = oldContainer.x + size / 2;
        burst.y = oldContainer.y + size / 2;
        burst.scale.set(0.5);
        burst.alpha = 0;
        burst.blendMode = PIXI.BLEND_MODES.ADD;
        oldContainer.parent.addChild(burst);
        gsap.timeline({ delay: idx * 0.05 })
          .to(burst, { alpha: 1.0, duration: 0.08 }, 0)
          .to(burst.scale, { x: 2.6, y: 2.6, duration: 0.5, ease: 'power2.out' }, 0)
          .to(burst, {
            alpha: 0, duration: 0.4, delay: 0.1, ease: 'power2.in',
            onComplete: () => {
              gsap.killTweensOf(burst);
              gsap.killTweensOf(burst.scale);
              try { burst.destroy(); } catch {}
            },
          }, 0);
        setTimeout(() => {
          if (burst && !burst.destroyed) try { burst.destroy(); } catch {}
        }, 1500);
      }
    });

    // STAGE 2: Wait for explosion peak before starting break/transform
    await new Promise(r => setTimeout(r, 280));

    const transformPromises = goldWinCells.map(({ reel: r, row }) => {
      return new Promise(resolve => {
        const sym = this.reels[r].symbols[row];
        if (!sym) { resolve(); return; }
        const oldContainer = sym.sprite;
        const size = this.symbolSize;

        // CLEAN BREAK: shrink + fade old container (frame + inner symbol together),
        // then instantly spawn Wild in its place. No intermediate rosette graphic.
        gsap.timeline({
          onComplete: () => {
            this.killSymbolTweens(sym);
            if (oldContainer.parent) oldContainer.parent.removeChild(oldContainer);
            if (!oldContainer.destroyed) oldContainer.destroy({ children: true });

            const newContainer = this.createSymbol(WILD_ID);
            newContainer.y = row * size;
            newContainer.alpha = 0;
            newContainer.scale.set(0.3);
            this.reels[r].container.addChild(newContainer);
            this.reels[r].symbols[row] = {
              sprite: newContainer, id: WILD_ID, _breathing: false,
            };
            // Await wild fully formed (alpha 1, scale 1) before resolve so downstream
            // G5 highlightWins captures correct base scale.
            const alphaP = new Promise(res => {
              gsap.to(newContainer, { alpha: 1, duration: 0.22, ease: 'power2.out', onComplete: res });
            });
            const scaleP = new Promise(res => {
              gsap.to(newContainer.scale, { x: 1, y: 1, duration: 0.32, ease: 'back.out(2)', onComplete: res });
            });
            Promise.all([alphaP, scaleP]).then(() => resolve());
          },
        })
        .to(oldContainer.scale, { x: 0.2, y: 0.2, duration: 0.22, ease: 'power2.in' }, 0)
        .to(oldContainer, { alpha: 0, duration: 0.22, ease: 'power2.in' }, 0);
      });
    });
    await Promise.all(transformPromises);
    this.updateGrid();
    return convertedKeys;
  },

  // [unused legacy helper kept for reference]
  getWildSpawnPositionsFromGoldWins(wins) {
    const positions = new Set();
    const cellMap = new Set();
    wins.forEach(w => {
      if (w.isScatter || !w.cells) return;
      w.cells.forEach(c => cellMap.add(`${c.reel}-${c.row}`));
    });
    for (const reel of this.reels) {
      for (const sym of reel.symbols) {
        // After removeWinningCells, sym.id may be null but isGoldFrame still set
        // We need to check this BEFORE removeWinningCells, but the caller will
        // do that. Here we just expose the cells set for filtering by caller.
      }
    }
    return cellMap;
  },

  killSymbolTweens(symData) {
    if (!symData || !symData.sprite) return;
    if (symData._pulseTl) { symData._pulseTl.kill(); symData._pulseTl = null; }
    gsap.killTweensOf(symData.sprite);
    gsap.killTweensOf(symData.sprite.scale);
    symData.sprite.children.forEach(c => {
      gsap.killTweensOf(c);
      if (c.scale) gsap.killTweensOf(c.scale);
    });
  },

  createSymbol(symId) {
    const sym = SYMBOLS.find(s => s.id === symId);
    const container = new PIXI.Container();
    const size = this.symbolSize;
    const pad = 2;
    const innerSize = size - pad * 2;
    const fit = innerSize - 6;

    // Cell backplate + border REMOVED per user request — only the transparent-PNG
    // symbol logo renders, no dark backplate or gold cell line.

    const path = ASSET_PATH[symId];
    // SCATTER VIDEO texture (priority 1): if coffin.mp4 loaded, use it
    if (symId === SCATTER_ID && this._coffinVideoTex) {
      const sprite = new PIXI.Sprite(this._coffinVideoTex);
      sprite.anchor.set(0.5);
      sprite.x = size / 2; sprite.y = size / 2;
      const apply = () => {
        const tw = sprite.texture.orig?.width || sprite.texture.width || 512;
        const th = sprite.texture.orig?.height || sprite.texture.height || 512;
        if (tw > 0 && th > 0) sprite.scale.set(fit / Math.max(tw, th));
      };
      if (sprite.texture.valid) apply();
      else sprite.texture.baseTexture.once('loaded', apply);
      container.addChild(sprite);
    }
    // SCATTER sprite-sheet (priority 2): AnimatedSprite
    else if (symId === SCATTER_ID && this._coffinFrames) {
      const anim = new PIXI.AnimatedSprite(this._coffinFrames);
      anim.anchor.set(0.5);
      anim.x = size / 2; anim.y = size / 2;
      anim.animationSpeed = 0.30;
      anim.loop = true;
      anim.play();
      const frame = this._coffinFrames[0];
      const fw = frame.orig.width, fh = frame.orig.height;
      anim.scale.set(fit / Math.max(fw, fh));
      container.addChild(anim);
    } else if (path) {
      const tex = PIXI.Assets.cache.get(path) || PIXI.Texture.from(path);
      const sprite = new PIXI.Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.x = size / 2; sprite.y = size / 2;
      const apply = () => {
        const tw = sprite.texture.orig ? sprite.texture.orig.width : sprite.texture.width;
        const th = sprite.texture.orig ? sprite.texture.orig.height : sprite.texture.height;
        if (tw > 0 && th > 0) {
          const baseScale = fit / Math.max(tw, th);
          sprite.scale.set(baseScale);
          // Start idle breathing for premium symbols (no-op for letters)
          applyIdleAnim(sprite, symId, baseScale);
        }
      };
      if (sprite.texture.valid) apply();
      else {
        sprite.scale.set(0);
        sprite.texture.baseTexture.once('loaded', apply);
      }
      container.addChild(sprite);
    } else {
      const fb = new PIXI.Text(sym.label, new PIXI.TextStyle({
        fontFamily: 'Cinzel, Georgia', fontSize: size * 0.4, fontWeight: '900',
        fill: '#f7c873', stroke: '#1a0808', strokeThickness: 4,
      }));
      fb.anchor.set(0.5);
      fb.x = size / 2; fb.y = size / 2;
      container.addChild(fb);
    }

    container._symId = symId;
    return container;
  },

  randomSymbol(reelIdx) {
    const baseWeights = REEL_WEIGHTS[reelIdx];
    const adjusted = {};
    let total = 0;
    for (const [id, w] of Object.entries(baseWeights)) {
      let adj = Difficulty.weightFor(id, w);
      // Ante Bet boost: scatter (COFFIN) weight × N → free spin trigger lebih sering
      if (this._anteBet && id === 'COFFIN') adj *= ANTE_BET_SCATTER_BOOST;
      adjusted[id] = adj;
      total += adj;
    }
    let r = Math.random() * total;
    for (const [id, w] of Object.entries(adjusted)) {
      r -= w;
      if (r <= 0) return id;
    }
    return 'TEN';
  },

  updateGrid() {
    this.grid = this.reels.map(reel => reel.symbols.map(s => s.id));
  },

  // Return a grid copy where gold-framed positions are substituted with WILD_ID.
  // Used by cascade evaluation so gold→wild "value" is paid in the CURRENT iter,
  // even though the visual transformation happens during removeWinningCells.
  gridWithGoldsAsWilds() {
    return this.reels.map(reel => reel.symbols.map(s => s.isGoldFrame ? WILD_ID : s.id));
  },

  spin(turbo = 0) {
    return new Promise(async (resolve) => {
      if (this.spinning) return resolve(null);
      this.spinning = true;
      Audio.spinStart();
      Audio.reelWhooshStart?.();

      // Turbo levels: 0=off, 1..5 increasingly fast
      const TURBO_PRESETS = [
        { baseDur: 1.6,  reelDelay: 0.40 },  // 0 OFF (default)
        { baseDur: 1.0,  reelDelay: 0.30 },  // 1
        { baseDur: 0.7,  reelDelay: 0.22 },  // 2
        { baseDur: 0.45, reelDelay: 0.15 },  // 3
        { baseDur: 0.28, reelDelay: 0.10 },  // 4
        { baseDur: 0.15, reelDelay: 0.05 },  // 5 MAX
      ];
      const lvl = typeof turbo === 'number' ? turbo : (turbo ? 3 : 0);
      const preset = TURBO_PRESETS[Math.max(0, Math.min(5, lvl))];
      const baseDur = preset.baseDur;
      const reelDelay = preset.reelDelay;
      const numReels = this.reels.length;

      const allSymbols = [];
      for (let r = 0; r < numReels; r++) {
        const reelResult = [];
        let hasScatter = false;
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
          let id = this.randomSymbol(r);
          let safety = 0;
          while (id === SCATTER_ID && hasScatter && safety++ < 20) {
            id = this.randomSymbol(r);
          }
          if (id === SCATTER_ID) hasScatter = true;
          reelResult.push(id);
        }
        allSymbols.push(reelResult);
      }

      // Pre-compute gold frame mask BEFORE spin animation so frames are visible
      // DURING the drop (falling with the symbols).
      const goldMask = this.computeGoldMask(allSymbols);

      // PG-style multi-reel anticipation: every reel where >=2 scatters are
      // already locked in BEFORE it stops gets suspense (longer spin + glow).
      // Duration extension escalates per anticipating reel so each next reel
      // feels slower than the last.
      const promises = [];
      let antiReelsSoFar = 0;
      for (let r = 0; r < numReels; r++) {
        const scattersBeforeThisReel = allSymbols
          .slice(0, r)
          .reduce((sum, strip) => sum + strip.filter(s => s === SCATTER_ID).length, 0);
        const isAnticipation = !turbo && scattersBeforeThisReel >= 2;
        // Escalating extra duration so anticipation feels like WB's reel hold —
        // each subsequent reel that still might land scatter spins noticeably
        // longer: +1.6s, +2.3s, +3.0s for reels 1/2/3 of the anticipation chain.
        const extraDur = isAnticipation ? 1.6 + antiReelsSoFar * 0.7 : 0;
        const dur = baseDur + r * reelDelay + extraDur;
        if (isAnticipation) {
          antiReelsSoFar++;
          Audio.anticipation();
          this.showAnticipationGlow(r, (dur + 0.3) * 1000);
        }
        await new Promise(rr => setTimeout(rr, r === 0 ? 0 : reelDelay * 1000));
        promises.push(this.spinReel(r, dur, allSymbols[r], goldMask[r]));
      }

      await Promise.all(promises);
      Audio.reelWhooshStop?.();
      this.updateGrid();
      this.startIdleBreathing();
      this.startScatterPulse();
      this.spinning = false;
      resolve(this.grid);
    });
  },

  spinReel(reelIdx, duration, newSymbols, goldMaskForReel = null) {
    return new Promise(resolve => {
      const reel = this.reels[reelIdx];
      const size = this.symbolSize;
      const numRows = GAME_CONFIG.ROWS;
      const fillerRows = 6;
      const totalStrip = numRows + fillerRows;
      const scrollDist = totalStrip * size;

      // Strip: result symbols (top), then random fillers (below result, scroll past)
      const stripIds = [...newSymbols];
      for (let i = 0; i < fillerRows; i++) {
        stripIds.push(this.randomSymbol(reelIdx));
      }

      // Place strip above viewport; attach gold frame to RESULT sprites
      // (indices 0..numRows-1) during creation so they fall WITH the gold frame.
      const stripSprites = stripIds.map((id, i) => {
        const sprite = this.createSymbol(id);
        sprite.y = i * size - scrollDist;
        reel.container.addChild(sprite);
        const symData = { sprite, id, isGoldFrame: false };
        if (i < numRows && goldMaskForReel && goldMaskForReel[i]) {
          this._applyGoldFrameToSym(symData);
        }
        return symData;
      });

      gsap.to(reel.container, {
        y: scrollDist, duration, ease: 'power2.out',
        onComplete: () => {
          // Remove old sprites (now scrolled below viewport)
          reel.symbols.forEach(s => {
            this.killSymbolTweens(s);
            if (s.sprite && s.sprite.parent) {
              reel.container.removeChild(s.sprite);
              s.sprite.destroy({ children: true });
            }
          });
          // Remove fillers — kill breathing/sway tweens FIRST or they'll fire on null sprite
          for (let i = numRows; i < stripSprites.length; i++) {
            const s = stripSprites[i];
            this.killSymbolTweens(s);
            if (s.sprite.parent) {
              reel.container.removeChild(s.sprite);
              s.sprite.destroy({ children: true });
            }
          }
          // Reset container.y, reposition result sprites to viewport rows
          reel.container.y = 0;
          reel.symbols = [];
          for (let i = 0; i < numRows; i++) {
            const s = stripSprites[i];
            s.sprite.y = i * size;
            // Carry over gold frame metadata (sprite already has visual attached)
            reel.symbols.push({
              sprite: s.sprite,
              id: s.id,
              _breathing: false,
              isGoldFrame: !!s.isGoldFrame,
              _goldFrame: s._goldFrame || null,
              _goldFilm: s._goldFilm || null,
              _goldFrameTl: s._goldFrameTl || null,
              _goldFrameGlow: s._goldFrameGlow || null, // G4
              _goldDimmedChild: s._goldDimmedChild || null,
            });
          }
          Audio.reelStop(reelIdx);
          if (newSymbols.includes(SCATTER_ID)) Audio.scatterLand();

          // G1 — Impact bounce: scale squash with bottom-pivot for "landing weight" feel.
          // Each row symbol gets a brief y-offset wave so bottom stays anchored.
          // Avoids container pivot manipulation (which would visually shift the reel).
          {
            const symbols = reel.symbols;
            const totalRows = numRows;
            symbols.forEach((s, rowIdx) => {
              if (!s.sprite || s.sprite.destroyed) return;
              const baseY = s.sprite.y;
              // Wave amplitude: top row most compression, bottom row zero
              const amp = ((totalRows - 1 - rowIdx) / (totalRows - 1)) * size * 0.08;
              const delay = (totalRows - 1 - rowIdx) * 0.01; // slight cascade per row
              gsap.timeline({ delay })
                .to(s.sprite, { y: baseY + amp, duration: 0.07, ease: 'sine.in' })
                .to(s.sprite, { y: baseY, duration: 0.22, ease: 'back.out(2.6)' });
            });
          }

          resolve();
        },
      });
    });
  },

  // G5 — Burst texture cache (radial gradient glow used for win cell flash).
  _getBurstTexture() {
    if (this._burstTexture) return this._burstTexture;
    const g = new PIXI.Graphics();
    const cx = 50, cy = 50;
    for (let i = 0; i < 8; i++) {
      g.beginFill(0xfff5d6, 0.65 - i * 0.075);
      g.drawCircle(cx, cy, 10 + i * 5);
      g.endFill();
    }
    this._burstTexture = this.app.renderer.generateTexture(g);
    return this._burstTexture;
  },

  highlightWins(wins) {
    const cIter = this._cascadeIter || 0;
    const size = this.symbolSize;
    let chimeOrder = 0;
    wins.forEach(win => {
      if (win.isScatter || !win.cells || win.cells.length === 0) return;
      win.cells.forEach(cell => {
        const sym = this.reels[cell.reel].symbols[cell.row];
        if (!sym || !sym.sprite || sym.sprite.destroyed) return;
        const sprite = sym.sprite;
        // WIN HIGHLIGHT chime, staggered per cell with cascade-pitched
        const localOrder = chimeOrder++;
        setTimeout(() => Audio.winHighlight?.(cIter), localOrder * 50);
        // Silence PIXI internal deprecation warning from @pixi/filter-glow color
        // setter (library uses deprecated PIXI.hex2rgb internally — not our bug).
        // try/finally guarantees restore even if constructor throws.
        const _origWarn = console.warn;
        console.warn = () => {};
        let glow;
        try {
          glow = new GlowFilter({
            distance: 18, outerStrength: 3, innerStrength: 0,
            color: 0xf39c12, quality: 0.5,
          });
        } finally {
          console.warn = _origWarn;
        }
        sprite.filters = [glow];
        setTimeout(() => {
          // Clear filter from sprite (if it still exists) AND destroy the filter
          // object so its GPU resources are freed. Without destroy() each glow
          // leaks memory across cascades.
          if (sprite && !sprite.destroyed) sprite.filters = null;
          try { glow.destroy(); } catch {}
        }, 1800);

        // G5: Scale-pop celebration on win cell (sprite pulses 1.0 → 1.18 → 1.0)
        const origSX = sprite.scale.x;
        const origSY = sprite.scale.y;
        const popDelay = localOrder * 0.04;
        gsap.timeline({ delay: popDelay })
          .to(sprite.scale, { x: origSX * 1.18, y: origSY * 1.18, duration: 0.16, ease: 'back.out(3)' })
          .to(sprite.scale, { x: origSX, y: origSY, duration: 0.28, ease: 'sine.inOut' });

        // G5: Bright burst flash at cell center (additive blend, expands + fades)
        if (sprite.parent) {
          const burst = new PIXI.Sprite(this._getBurstTexture());
          burst.anchor.set(0.5);
          burst.x = sprite.x + size / 2;
          burst.y = sprite.y + size / 2;
          burst.scale.set(0.5);
          burst.alpha = 0;
          burst.blendMode = PIXI.BLEND_MODES.ADD;
          sprite.parent.addChild(burst);
          gsap.timeline({ delay: popDelay })
            .to(burst, { alpha: 0.95, duration: 0.08 }, 0)
            .to(burst.scale, { x: 2.2, y: 2.2, duration: 0.5, ease: 'power2.out' }, 0)
            .to(burst, {
              alpha: 0, duration: 0.4, delay: 0.1, ease: 'power2.in',
              onComplete: () => {
                gsap.killTweensOf(burst);
                gsap.killTweensOf(burst.scale);
                try { burst.destroy(); } catch {}
              },
            }, 0);
          // Bug 2 FIX: safety cleanup in case GSAP tween onComplete doesn't fire
          // (e.g., interrupted by cascade transition or game state change)
          setTimeout(() => {
            if (burst && !burst.destroyed) {
              gsap.killTweensOf(burst);
              gsap.killTweensOf(burst.scale);
              try { burst.destroy(); } catch {}
            }
          }, 1500); // 1.5s — well after expected animation completion (~0.5s)
        }
      });
    });
  },

  // Cascade: pop winning cells with break animation, then drop remaining symbols
  // down to fill gaps + spawn new symbols at the top.
  // goldKeys (Set<"r-row">): positions where gold-framed symbols won; these cells
  // POP normally along with other winners, then respawn as Wild (Catrina) at the
  // SAME position (no null gap). Cascade then skips those positions.
  async removeWinningCells(wins, goldKeys = null) {
    const cellMap = new Set();
    wins.forEach(w => {
      if (w.isScatter || !w.cells) return;
      w.cells.forEach(c => {
        cellMap.add(`${c.reel}-${c.row}`);
      });
    });
    if (cellMap.size === 0) return new Set();

    const convertedKeys = new Set(); // gold cells that became Wild — return for caller
    const breakPromises = [];
    const cIter = this._cascadeIter || 0;
    let cellOrder = 0;

    cellMap.forEach(key => {
      const [r, row] = key.split('-').map(Number);
      const sym = this.reels[r].symbols[row];
      if (!sym || sym.id == null) return;
      const sprite = sym.sprite;
      const isGold = !!(goldKeys && goldKeys.has(key));

      this.killSymbolTweens(sym);
      if (sym._goldFrameTl) { sym._goldFrameTl.kill(); sym._goldFrameTl = null; }

      // CASCADE POP sound — staggered per cell, pitch escalates with cascade iter
      const localOrder = cellOrder++;
      setTimeout(() => Audio.cascadePop?.(cIter), localOrder * 35);
      // GOLD cells also get explosion sound at break time (the "ledakan")
      if (isGold) {
        setTimeout(() => Audio.winHighlight?.(cIter), localOrder * 35);
      }

      const p = new Promise(resolve => {
        const cleanup = () => {
          gsap.killTweensOf([sprite, sprite.scale]);
          if (sprite.parent) sprite.parent.removeChild(sprite);
          if (!sprite.destroyed) sprite.destroy({ children: true });

          if (isGold) {
            // Gold cell: respawn Wild at SAME position (emerge from explosion)
            convertedKeys.add(key);
            const size = this.symbolSize;
            const newContainer = this.createSymbol(WILD_ID);
            newContainer.y = row * size;
            newContainer.alpha = 0;
            newContainer.scale.set(0.3);
            this.reels[r].container.addChild(newContainer);
            this.reels[r].symbols[row] = {
              sprite: newContainer, id: WILD_ID, _breathing: false,
            };
            // Await fade-in + scale tweens before resolving so wild is fully formed
            const alphaP = new Promise(res =>
              gsap.to(newContainer, { alpha: 1, duration: 0.22, ease: 'power2.out', onComplete: res })
            );
            const scaleP = new Promise(res =>
              gsap.to(newContainer.scale, { x: 1, y: 1, duration: 0.32, ease: 'back.out(2)', onComplete: res })
            );
            Promise.all([alphaP, scaleP]).then(() => resolve());
          } else {
            // Non-gold cell: leave empty for cascade fill
            this.reels[r].symbols[row] = { sprite: null, id: null };
            resolve();
          }
        };
        const tl = gsap.timeline({ onComplete: cleanup });
        tl.to(sprite.scale, { x: 1.3, y: 1.3, duration: 0.18, ease: 'power2.out' })
          .to(sprite.scale, { x: 0, y: 0, duration: 0.28, ease: 'power2.in' })
          .to(sprite, { alpha: 0, rotation: (Math.random() - 0.5) * 1.2, duration: 0.28, ease: 'power2.in' }, '-=0.28');
      });
      breakPromises.push(p);
    });
    await Promise.all(breakPromises);
    return convertedKeys;
  },

  async cascade() {
    const size = this.symbolSize;
    const reelsWithGaps = [];

    // Identify reels with gaps + collect survivors
    for (let r = 0; r < this.reels.length; r++) {
      const reel = this.reels[r];
      const emptyCount = reel.symbols.filter(s => s.id == null).length;
      if (emptyCount === 0) continue;
      const surviving = [];
      for (let row = 0; row < reel.symbols.length; row++) {
        if (reel.symbols[row].id != null) surviving.push(reel.symbols[row]);
      }
      reelsWithGaps.push({ reel, reelIdx: r, emptyCount, surviving });
    }
    if (reelsWithGaps.length === 0) {
      this.updateGrid();
      return;
    }

    // PHASE 1: surviving symbols drop down to bottom of reel — G2: bounce.out for landing weight
    const phase1 = [];
    for (const { reel, emptyCount, surviving } of reelsWithGaps) {
      surviving.forEach((sym, i) => {
        const targetY = (emptyCount + i) * size;
        const p = new Promise(resolve => {
          gsap.to(sym.sprite, {
            y: targetY,
            duration: 0.48,    // longer to accommodate bounce settle
            ease: 'bounce.out', // G2: bounce on landing (was 'power2.in')
            onComplete: resolve,
          });
        });
        phase1.push(p);
      });
    }
    await Promise.all(phase1);
    // Small pause between phases so user can see them settle
    await new Promise(r => setTimeout(r, 100));

    // PHASE 2: spawn new symbols at top + drop them down into the empty slots
    // RULE: NO scatter spawn during cascade. Only initial drop scatters count for FS trigger.
    const phase2 = [];
    for (const entry of reelsWithGaps) {
      const { reel, reelIdx, emptyCount, surviving } = entry;
      const newSymbols = [];
      for (let i = 0; i < emptyCount; i++) {
        let id = this.randomSymbol(reelIdx);
        let safety = 0;
        while (id === SCATTER_ID && safety++ < 30) {
          id = this.randomSymbol(reelIdx);
        }
        if (id === SCATTER_ID) id = 'TEN';
        const sprite = this.createSymbol(id);
        // Stagger spawn above viewport, top-most first
        sprite.y = -(emptyCount - i) * size;
        reel.container.addChild(sprite);
        const symData = { sprite, id, _breathing: false };
        // FREE SPIN signature: keep middle reel (index 2) GOLD throughout the bonus
        // round — new cascade symbols on middle reel get gold frame too.
        if (this.freeSpinMode && reelIdx === 2 && id !== WILD_ID && id !== SCATTER_ID) {
          this._applyGoldFrameToSym(symData);
        }
        newSymbols.push(symData);
      }
      // Animate each new symbol to its slot — G2: more pronounced waterfall stagger + longer bounce
      newSymbols.forEach((sym, i) => {
        const targetY = i * size;
        const p = new Promise(resolve => {
          gsap.to(sym.sprite, {
            y: targetY,
            duration: 0.5,         // longer for visible bounce
            ease: 'bounce.out',
            delay: i * 0.09,       // G2: stagger 0.06 → 0.09 for clearer cascade waterfall
            onComplete: () => {
              // G3: gold shimmer flash on landing (fire-and-forget, doesn't block resolve)
              shimmerSymbol(sym.sprite, 0.45);
              resolve();
            },
          });
        });
        phase2.push(p);
      });
      // Update final reel.symbols array (new on top, then survivors)
      reel.symbols = [...newSymbols, ...surviving];
    }
    await Promise.all(phase2);

    this.updateGrid();
    this.startScatterPulse();
  },
};
