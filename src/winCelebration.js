import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import { Emitter } from '@pixi/particle-emitter';
import { WIN_TIERS, ASSET_PATH, fmtMoney } from './config.js';
import { Audio } from './audio.js';

let _emberTexture = null;
function getEmberTexture(renderer) {
  if (_emberTexture) return _emberTexture;
  const g = new PIXI.Graphics();
  const r = 24;
  for (let i = 0; i < 6; i++) {
    g.beginFill(0xffffff, 1 - i / 6);
    g.drawCircle(r, r, r - i * 3);
    g.endFill();
  }
  _emberTexture = renderer.generateTexture(g);
  return _emberTexture;
}

// F2 — Papel picado confetti palette (traditional Mexican Day-of-Dead colors)
const PAPEL_PICADO_COLORS = [
  0xff5fa2, // hot pink
  0xff8c42, // orange
  0xffd23f, // yellow
  0x06d6a0, // green
  0x45b7d1, // turquoise
  0xb8559e, // purple
];

// White rectangle texture (8x14) used for ALL confetti, tinted per-sprite from palette above
let _confettiTexture = null;
function getConfettiTexture(renderer) {
  if (_confettiTexture) return _confettiTexture;
  const g = new PIXI.Graphics();
  g.beginFill(0xffffff);
  g.drawRect(0, 0, 8, 14);
  g.endFill();
  _confettiTexture = renderer.generateTexture(g);
  return _confettiTexture;
}

// F5 — Sparkle texture (small radial glow dot, 16×16)
let _sparkleTexture = null;
function getSparkleTexture(renderer) {
  if (_sparkleTexture) return _sparkleTexture;
  const g = new PIXI.Graphics();
  const r = 8;
  // Radial gradient — bright center, fade to transparent
  for (let i = 0; i < 5; i++) {
    g.beginFill(0xffffff, 0.95 - i * 0.18);
    g.drawCircle(r, r, r - i * 1.4);
    g.endFill();
  }
  _sparkleTexture = renderer.generateTexture(g);
  return _sparkleTexture;
}

// MOBILE PERFORMANCE: detect touch-only devices (no hover) and scale particle
// counts down so weaker hardware can maintain 60fps. Detected once per session.
const IS_LOW_PERF = typeof window !== 'undefined' && (
  (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) ||
  ((navigator?.maxTouchPoints || 0) > 0 && window.innerWidth < 900)
);
// Multiplier applied to particle counts on low-perf devices (60% of desktop)
const PERF_SCALE = IS_LOW_PERF ? 0.55 : 1.0;
const scaleCount = (n) => Math.max(8, Math.round(n * PERF_SCALE));

// Procedural gold coin texture for win celebration coin shower (F1)
let _coinTexture = null;
function getCoinTexture(renderer) {
  if (_coinTexture) return _coinTexture;
  const g = new PIXI.Graphics();
  const r = 16;
  // Outer rim — dark gold
  g.beginFill(0x8b6914);
  g.drawCircle(r, r, r);
  g.endFill();
  // Main face — gold
  g.beginFill(0xf39c12);
  g.drawCircle(r, r, r - 2);
  g.endFill();
  // Inner highlight ring
  g.beginFill(0xffd86b, 0.85);
  g.drawCircle(r, r, r - 5);
  g.endFill();
  // Top-left shine spot (3D depth)
  g.beginFill(0xfff5d6, 0.9);
  g.drawCircle(r - 5, r - 6, 3.5);
  g.endFill();
  // Center mark — simple "X" treasure cross
  g.lineStyle(2, 0x5b3d0e, 0.8);
  g.moveTo(r - 4, r - 4);
  g.lineTo(r + 4, r + 4);
  g.moveTo(r + 4, r - 4);
  g.lineTo(r - 4, r + 4);
  _coinTexture = renderer.generateTexture(g);
  return _coinTexture;
}

export const WinCelebration = {
  determineTier(winAmount, bet) {
    const mult = winAmount / bet;
    if (mult >= WIN_TIERS.LEGENDARY.min) return 'LEGENDARY';
    if (mult >= WIN_TIERS.EPIC.min)      return 'EPIC';
    if (mult >= WIN_TIERS.MEGA.min)      return 'MEGA';
    if (mult >= WIN_TIERS.BIG.min)       return 'BIG';
    return 'NORMAL';
  },

  play(tier, winAmount, app, stage, onComplete) {
    const config = WIN_TIERS[tier];
    const winEl = document.getElementById('win');

    if (tier === 'NORMAL') {
      this.rollCounter(winEl, 0, winAmount, config.duration, onComplete);
      return;
    }

    const overlay = new PIXI.Container();
    stage.addChild(overlay);
    const W = app.screen.width, H = app.screen.height;
    const cx = W / 2, cy = H / 2;

    // Dark vignette — lighter now since image is the focal element
    const vignette = new PIXI.Graphics();
    vignette.beginFill(0x000000, tier === 'LEGENDARY' ? 0.55 : 0.45);
    vignette.drawRect(0, 0, W, H);
    vignette.endFill();
    vignette.alpha = 0;
    overlay.addChild(vignette);

    // Rays + halo REMOVED per user request — image is now the focal element.
    // Stub objects so existing code referencing `rays` / `halo` doesn't break.
    const rays = new PIXI.Container();
    rays.alpha = 0;
    const halo = new PIXI.Container();
    halo.alpha = 0;
    halo.scale.set(1);
    overlay.addChild(rays);
    overlay.addChild(halo);

    // POLISH: Vertical light beam behind label (pulses opacity, dramatic spotlight feel)
    const lightBeam = new PIXI.Graphics();
    const beamW = W * 0.5;
    const beamH = H * 1.1;
    // Soft radial fade — bright center, transparent edges
    for (let i = 0; i < 8; i++) {
      const a = 0.08 * (1 - i / 8);
      const w = beamW * (1 - i * 0.1);
      lightBeam.beginFill(0xfff5d6, a);
      lightBeam.drawRect(-w / 2, -beamH / 2, w, beamH);
      lightBeam.endFill();
    }
    lightBeam.x = cx;
    lightBeam.y = cy;
    lightBeam.alpha = 0;
    overlay.addChild(lightBeam);

    // Tier image label (replaces PIXI.Text) — large BACKGROUND art per tier.
    // Image fills ~85% viewport width / 60% height. Coins/confetti spawn IN FRONT.
    const labelAsset = tier === 'LEGENDARY' ? ASSET_PATH.WIN_LEGENDARY
                     : tier === 'EPIC' ? ASSET_PATH.WIN_EPIC
                     : tier === 'MEGA' ? ASSET_PATH.WIN_MEGA
                     : ASSET_PATH.WIN_BIG;
    const labelTex = PIXI.Assets.cache.get(labelAsset) || PIXI.Texture.from(labelAsset);
    const label = new PIXI.Sprite(labelTex);
    label.anchor.set(0.5);
    const tw = label.texture.orig ? label.texture.orig.width : label.texture.width;
    const th = label.texture.orig ? label.texture.orig.height : label.texture.height;
    // COVER full reel viewport (Math.max — image fills 100%, may crop edges).
    const labelTargetScale = (tw > 0 && th > 0)
      ? Math.max(W / tw, H / th)
      : 1.0;
    if (!label.texture.valid) {
      label.texture.baseTexture.once('loaded', () => {
        if (!label.destroyed && label.scale.x > 0) {
          label.scale.set(labelTargetScale);
        }
      });
    }
    // Entrance — center positioned, with rotation backspin.
    // VARIETY: rotation direction randomized per win (50/50 CW vs CCW) so each win
    // entrance feels unique. NO tint applied — the label PNGs have their own bespoke
    // color art (purple altar, gold flowers, etc.) and tinting would distort them.
    const labelSettleY = cy;
    const entranceDropY = 70;
    const rotationDir = Math.random() < 0.5 ? -1 : 1;
    const labelStartRotation = (tier === 'LEGENDARY' ? Math.PI * 2 : tier === 'EPIC' ? Math.PI * 1.5 : tier === 'MEGA' ? Math.PI : Math.PI * 0.5) * rotationDir;
    label.x = cx;
    label.y = labelSettleY - entranceDropY;
    label.scale.set(0);
    label.rotation = labelStartRotation;
    overlay.addChild(label);

    // Counter — large bold
    const counterSize = tier === 'LEGENDARY' ? 92 : tier === 'EPIC' ? 76 : tier === 'MEGA' ? 64 : 56;
    const counter = new PIXI.Text('0.00', new PIXI.TextStyle({
      fontFamily: 'Cinzel, Georgia',
      fontSize: counterSize,
      fontWeight: '900',
      fill: ['#ffffff', '#f7c873', '#f39c12'],
      stroke: '#5b1818',
      strokeThickness: 6,
      dropShadow: true,
      dropShadowColor: '#f39c12',
      dropShadowBlur: 14,
      dropShadowDistance: 0,
      letterSpacing: 2,
    }));
    counter.anchor.set(0.5);
    // Position counter BELOW image (image is now full-screen, counter sits at lower 25%)
    counter.x = cx;
    counter.y = H * 0.78;
    counter.alpha = 0;
    counter.scale.set(0.7);
    overlay.addChild(counter);

    // Particle layers
    const burstLayer = new PIXI.Container();
    const ringLayer = new PIXI.Container();
    const sparkleLayer = new PIXI.Container(); // F5
    overlay.addChild(burstLayer);
    overlay.addChild(ringLayer);
    overlay.addChild(sparkleLayer);

    const counterDur = (config.duration - 1800) / 1000;
    const counterObj = { val: 0 };
    let lastTickVal = 0;

    let raysTween = null;
    // F4: track shake timelines so cleanup can kill them if celebration ends mid-shake
    let shakeImpactTl = null, shakeTremorTl = null;
    // F5: sparkle interval handle so cleanup can clear it
    let sparkleInterval = null;
    const stageOriginX = stage.x, stageOriginY = stage.y;
    const tl = gsap.timeline({
      onComplete: () => {
        if (raysTween) raysTween.kill();
        if (shakeImpactTl) shakeImpactTl.kill();
        if (shakeTremorTl) shakeTremorTl.kill();
        if (sparkleInterval) { clearInterval(sparkleInterval); sparkleInterval = null; }
        gsap.killTweensOf(stage);
        stage.x = stageOriginX;
        stage.y = stageOriginY;
        gsap.killTweensOf([rays, halo, label, counter, vignette, overlay]);
        // F1/F2/F5 cleanup: kill tweens on all dynamic sprites before destroy
        // so GSAP doesn't try to update null transforms next tick.
        const killChildTweens = (layer) => {
          if (!layer || !layer.children) return;
          for (const c of layer.children) {
            gsap.killTweensOf(c);
            if (c.scale) gsap.killTweensOf(c.scale);
          }
        };
        killChildTweens(burstLayer);
        killChildTweens(ringLayer);
        killChildTweens(sparkleLayer);
        overlay.destroy({ children: true });
        winEl.textContent = fmtMoney(winAmount);
        if (onComplete) onComplete();
      },
    });

    // F3 wobble settle amplitude (tier-scaled — bigger win = bigger wobble)
    const wobbleAmp = tier === 'LEGENDARY' ? 0.12 : tier === 'EPIC' ? 0.09 : tier === 'MEGA' ? 0.06 : 0.04;

    tl.to(vignette, { alpha: 1, duration: 0.4, ease: 'power2.out' })
      .to(rays, { alpha: 1, duration: 0.5, ease: 'power2.out' }, '-=0.2')
      .to(halo, { alpha: 1, duration: 0.6, ease: 'power2.out' }, '-=0.4')
      .to(halo.scale, { x: 1.2, y: 1.2, duration: 0.8, ease: 'power2.out' }, '-=0.6')
      // POLISH: Light beam fade in (dramatic spotlight behind label)
      .to(lightBeam, { alpha: 0.6, duration: 0.6, ease: 'power2.out' }, '-=0.5')
      // F3 Label entrance: simultaneous rotation + drop + scale pop (scaled to image fit)
      .to(label, { rotation: 0, duration: 0.75, ease: 'power3.out' }, '-=0.3')
      .to(label, { y: labelSettleY, duration: 0.6, ease: 'back.out(1.8)' }, '<')
      .to(label.scale, { x: labelTargetScale * 1.18, y: labelTargetScale * 1.18, duration: 0.55, ease: 'back.out(2.5)' }, '<')
      .to(label.scale, { x: labelTargetScale, y: labelTargetScale, duration: 0.25, ease: 'power2.out' })
      // F3 Wobble settle — brief rotation oscillation before holding still
      .to(label, { rotation: wobbleAmp, duration: 0.12, ease: 'sine.inOut' })
      .to(label, { rotation: -wobbleAmp * 0.65, duration: 0.13, ease: 'sine.inOut' })
      .to(label, { rotation: 0, duration: 0.1, ease: 'sine.out' })
      .to(counter, { alpha: 1, duration: 0.3 }, '-=0.2')
      .to(counter.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2)' }, '-=0.3')
      .to(counterObj, {
        val: winAmount,
        duration: counterDur,
        ease: tier === 'LEGENDARY' ? 'power2.inOut' : 'power1.out',
        onStart: () => {
          // F5: start sparkle trails around counter when rolling begins
          const sparkleIntervalMs = tier === 'LEGENDARY' ? 50 : tier === 'EPIC' ? 80 : tier === 'MEGA' ? 120 : 180;
          sparkleInterval = setInterval(() => {
            // Spawn 1-2 sparkles per tick (more on higher tiers)
            const burst = tier === 'LEGENDARY' ? 3 : tier === 'EPIC' ? 2 : 1;
            for (let i = 0; i < burst; i++) {
              this.spawnSparkle(sparkleLayer, counter.x, counter.y, app.renderer);
            }
          }, sparkleIntervalMs);
        },
        onComplete: () => {
          if (sparkleInterval) { clearInterval(sparkleInterval); sparkleInterval = null; }
        },
        onUpdate: () => {
          const v = counterObj.val;
          counter.text = fmtMoney(v);
          winEl.textContent = fmtMoney(v);
          // Audio tick every X amount + pitch scales with accumulated value
          if (v - lastTickVal > winAmount / 30) {
            Audio.coinTick(v);
            lastTickVal = v;
          }
        },
      })
      .to(label, { y: labelSettleY - 15, duration: 0.3, yoyo: true, repeat: 3, ease: 'sine.inOut' },
        '-=' + Math.min(1, counterDur))
      .to([label, counter], { y: '-=10', duration: 0.2, ease: 'power2.out' }, '+=0.3')
      .to(overlay, { alpha: 0, duration: 0.6, ease: 'power2.in' }, '+=0.4');

    // Rays rotation removed per user request — rays stubbed out (no visual).

    // POLISH: Light beam pulse animation (continuous breathing 0.45 ↔ 0.7 alpha)
    let beamPulse = gsap.to(lightBeam, {
      alpha: 0.3, duration: 1.2, ease: 'sine.inOut',
      yoyo: true, repeat: -1,
      delay: 0.8, // start after initial fade in completes
    });
    // Track for cleanup
    raysTween = beamPulse; // reuse existing cleanup ref

    // F4 — Tier-aware multi-phase camera shake with random direction.
    // BIG: subtle (was none); MEGA: medium; EPIC: heavy; LEGENDARY: ULTRA + secondary tremor.
    const shakeConfig = {
      BIG:       { amp: 4,  repeats: 5,  dur: 0.06 },
      MEGA:      { amp: 8,  repeats: 9,  dur: 0.05 },
      EPIC:      { amp: 13, repeats: 13, dur: 0.045 },
      LEGENDARY: { amp: 20, repeats: 17, dur: 0.04 },
    }[tier];
    const shakeStartDelay = 0.85; // sync with label pop apex

    if (shakeConfig) {
      // PHASE 1 — Initial impact shake: random direction each step, decaying amplitude
      shakeImpactTl = gsap.timeline({ delay: shakeStartDelay });
      for (let i = 0; i < shakeConfig.repeats; i++) {
        const decay = Math.pow(0.92, i);
        const dx = (Math.random() - 0.5) * 2 * shakeConfig.amp * decay;
        const dy = (Math.random() - 0.5) * 2 * shakeConfig.amp * decay;
        shakeImpactTl.to(stage, {
          x: stageOriginX + dx,
          y: stageOriginY + dy,
          duration: shakeConfig.dur,
          ease: 'sine.inOut',
        });
      }
      // Settle to origin after impact
      shakeImpactTl.to(stage, {
        x: stageOriginX, y: stageOriginY,
        duration: 0.12, ease: 'power2.out',
      });

      // PHASE 2 — LEGENDARY only: sustained low tremor 0.4s after impact ends
      if (tier === 'LEGENDARY') {
        const impactDur = shakeConfig.dur * shakeConfig.repeats + 0.12;
        shakeTremorTl = gsap.timeline({ delay: shakeStartDelay + impactDur + 0.35 });
        for (let i = 0; i < 12; i++) {
          const dx = (Math.random() - 0.5) * 14;
          const dy = (Math.random() - 0.5) * 11;
          shakeTremorTl.to(stage, {
            x: stageOriginX + dx, y: stageOriginY + dy,
            duration: 0.08, ease: 'sine.inOut',
          });
        }
        shakeTremorTl.to(stage, {
          x: stageOriginX, y: stageOriginY,
          duration: 0.18, ease: 'power2.out',
        });
      }
    }

    if (tier === 'MEGA' || tier === 'EPIC' || tier === 'LEGENDARY') {
      this.spawnEmberBurst(burstLayer, W, H, tier, app.renderer);
    }
    this.spawnRingBurst(ringLayer, cx, cy, tier, app.renderer);
    // F1: Coin shower — Wild Bandito signature; coins rain from top with rotation+bounce
    this.spawnCoinShower(burstLayer, W, H, tier, app.renderer);
    // F2: Multi-color papel picado confetti — slower flutter behind coins
    this.spawnConfetti(burstLayer, W, H, tier, app.renderer);

    if (tier === 'LEGENDARY') {
      this.lightningFlash(overlay, W, H);
    }
  },

  // F5 — Sparkle trail: small radial sparkle that scales up, drifts outward from counter, fades.
  // Called periodically via setInterval during counter rolling. Random gold/white tint.
  spawnSparkle(layer, cx, cy, renderer) {
    const texture = getSparkleTexture(renderer);
    const sparkle = new PIXI.Sprite(texture);
    sparkle.anchor.set(0.5);
    // Spawn position — random angle around counter, ellipse shape (wider horizontally)
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 90;
    sparkle.x = cx + Math.cos(angle) * dist;
    sparkle.y = cy + Math.sin(angle) * dist * 0.55;
    sparkle.scale.set(0);
    sparkle.alpha = 0;
    // Tint: 60% gold (#ffd86b), 30% bright white (#ffffff), 10% orange-gold (#ffb347)
    const r = Math.random();
    sparkle.tint = r < 0.6 ? 0xffd86b : r < 0.9 ? 0xffffff : 0xffb347;
    layer.addChild(sparkle);

    // Drift outward + alpha pop + scale grow → shrink → fade
    const driftX = Math.cos(angle) * 25 + (Math.random() - 0.5) * 20;
    const driftY = Math.sin(angle) * 15 + (Math.random() - 0.5) * 20;
    const peakScale = 0.6 + Math.random() * 0.6;
    const totalDur = 0.55 + Math.random() * 0.2;

    gsap.to(sparkle, { x: sparkle.x + driftX, y: sparkle.y + driftY, duration: totalDur, ease: 'power1.out' });
    gsap.to(sparkle, { alpha: 1, duration: 0.08 });
    gsap.to(sparkle.scale, { x: peakScale, y: peakScale, duration: 0.18, ease: 'back.out(2)' });
    gsap.to(sparkle.scale, { x: 0.15, y: 0.15, duration: totalDur - 0.18, delay: 0.18, ease: 'power2.in' });
    gsap.to(sparkle, {
      alpha: 0,
      duration: 0.3,
      delay: totalDur - 0.3,
      ease: 'power2.in',
      onComplete: () => {
        try { sparkle.destroy(); } catch {}
      },
    });
  },

  // F2 — Papel Picado Confetti: multi-color paper flutter (slower, papery vs coin gravity).
  // Tier-aware: BIG 30, MEGA 60, EPIC 100, LEGENDARY 180 confetti.
  // Falls off-screen (no bounce, lighter than coins), fluttering via scaleX oscillation.
  spawnConfetti(container, W, H, tier, renderer) {
    const count = scaleCount(tier === 'LEGENDARY' ? 180 : tier === 'EPIC' ? 100 : tier === 'MEGA' ? 60 : 30);
    const texture = getConfettiTexture(renderer);
    const spawnWindow = tier === 'LEGENDARY' ? 2.2 : 1.6;
    const startDelay = 0.5; // slightly after coin shower start

    for (let i = 0; i < count; i++) {
      const conf = new PIXI.Sprite(texture);
      conf.anchor.set(0.5);
      conf.x = Math.random() * W;
      conf.y = -20 - Math.random() * 100;
      // Random scale variation (papery flutter feel)
      const sx = 0.6 + Math.random() * 0.5;
      const sy = 0.7 + Math.random() * 0.6;
      conf.scale.set(sx, sy);
      conf.rotation = Math.random() * Math.PI * 2;
      // Random color from papel picado palette (cycle so each appears ~equally)
      conf.tint = PAPEL_PICADO_COLORS[i % PAPEL_PICADO_COLORS.length];
      conf.alpha = 0;
      container.addChild(conf);

      const delay = startDelay + (i / count) * spawnWindow + Math.random() * 0.2;
      const fallDur = 2.4 + Math.random() * 1.3; // slower than coins (papery feel)
      const drift = (Math.random() - 0.5) * 220; // wider horizontal sway than coins
      const landY = H + 30; // fall completely off-screen (no bounce)
      const spinDir = Math.random() > 0.5 ? 1 : -1;
      const totalSpin = (5 + Math.random() * 6) * Math.PI * 2; // more spins than coins

      // Appear (slightly translucent for paper feel)
      gsap.to(conf, { alpha: 0.95, duration: 0.18, delay });
      // Fall with slight acceleration (NOT bounce — papery flutter)
      gsap.to(conf, {
        y: landY,
        x: conf.x + drift,
        duration: fallDur,
        delay,
        ease: 'power1.in',
      });
      // Continuous heavy rotation
      gsap.to(conf, {
        rotation: '+=' + (totalSpin * spinDir),
        duration: fallDur,
        delay,
        ease: 'none',
      });
      // 3D flutter — scaleX oscillation (slower than coin flip for paper feel)
      const flipDur = 0.55 + Math.random() * 0.4;
      const flipRepeats = Math.max(2, Math.floor(fallDur / flipDur));
      gsap.to(conf.scale, {
        x: -sx,
        duration: flipDur,
        delay,
        repeat: flipRepeats,
        yoyo: true,
        ease: 'sine.inOut',
      });
      // Fade out before reaching bottom (so doesn't pile up off-screen)
      gsap.to(conf, {
        alpha: 0,
        duration: 0.5,
        delay: delay + fallDur - 0.3,
        ease: 'power2.in',
      });
    }
  },

  // F1 — Coin Shower: coins fall from top with rotation + bounce + flip.
  // Tier-aware: BIG 20, MEGA 35, EPIC 55, LEGENDARY 90 coins.
  spawnCoinShower(container, W, H, tier, renderer) {
    const count = scaleCount(tier === 'LEGENDARY' ? 90 : tier === 'EPIC' ? 55 : tier === 'MEGA' ? 35 : 20);
    const texture = getCoinTexture(renderer);
    const spawnWindow = tier === 'LEGENDARY' ? 1.6 : 1.2; // seconds over which coins spawn
    const startDelay = 0.45; // wait until label pops in before coin shower starts

    for (let i = 0; i < count; i++) {
      const coin = new PIXI.Sprite(texture);
      coin.anchor.set(0.5);
      coin.x = Math.random() * W;
      coin.y = -30 - Math.random() * 120;
      // POLISH: Parallax depth tier — 3 depth layers for 3D illusion
      // 25% close (large+fast), 50% mid, 25% far (small+slow)
      const depthRoll = Math.random();
      const depthTier = depthRoll < 0.25 ? 'close' : depthRoll < 0.75 ? 'mid' : 'far';
      const scale = depthTier === 'close' ? (1.3 + Math.random() * 0.4)   // 1.3-1.7
                  : depthTier === 'mid'   ? (0.8 + Math.random() * 0.4)   // 0.8-1.2
                  :                          (0.45 + Math.random() * 0.2); // 0.45-0.65
      coin.scale.set(scale);
      coin.rotation = Math.random() * Math.PI * 2;
      coin.alpha = 0;
      // Far coins slightly tinted darker (atmospheric depth)
      if (depthTier === 'far') coin.tint = 0xd4a17b;
      container.addChild(coin);

      const delay = startDelay + (i / count) * spawnWindow + Math.random() * 0.15;
      // Close coins fall FASTER, far coins fall SLOWER (parallax)
      const fallDur = depthTier === 'close' ? (0.9 + Math.random() * 0.3)
                    : depthTier === 'mid'   ? (1.1 + Math.random() * 0.5)
                    :                          (1.4 + Math.random() * 0.6);
      const drift = (Math.random() - 0.5) * 100; // horizontal drift
      const landY = H - 30 + Math.random() * 30;
      const spinDir = Math.random() > 0.5 ? 1 : -1;
      const totalSpin = (3 + Math.random() * 3) * Math.PI * 2;

      // Appear
      gsap.to(coin, { alpha: 1, duration: 0.12, delay });
      // Fall with bounce
      gsap.to(coin, {
        y: landY,
        x: coin.x + drift,
        duration: fallDur,
        delay,
        ease: 'bounce.out',
      });
      // Continuous rotation
      gsap.to(coin, {
        rotation: '+=' + (totalSpin * spinDir),
        duration: fallDur,
        delay,
        ease: 'none',
      });
      // 3D flip — scaleX oscillation gives perspective rotation feel
      const flipDur = 0.35 + Math.random() * 0.25;
      const flipRepeats = Math.max(2, Math.floor(fallDur / flipDur));
      gsap.to(coin.scale, {
        x: -scale,
        duration: flipDur,
        delay,
        repeat: flipRepeats,
        yoyo: true,
        ease: 'sine.inOut',
      });
      // Fade out after settle
      gsap.to(coin, {
        alpha: 0,
        duration: 0.5,
        delay: delay + fallDur + 0.7,
        ease: 'power2.in',
      });
    }
  },

  spawnRingBurst(container, cx, cy, tier, renderer) {
    const count = scaleCount(tier === 'LEGENDARY' ? 36 : tier === 'EPIC' ? 28 : tier === 'MEGA' ? 22 : 16);
    const texture = getEmberTexture(renderer);
    const radius = 250;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const tx = cx + Math.cos(angle) * radius;
      const ty = cy + Math.sin(angle) * radius;
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.x = cx;
      sprite.y = cy;
      sprite.scale.set(0.3);
      sprite.alpha = 0;
      sprite.tint = 0xf7c873;
      container.addChild(sprite);
      gsap.to(sprite, {
        x: tx, y: ty,
        alpha: 1,
        duration: 0.6,
        delay: 0.4 + (i / count) * 0.15,
        ease: 'power2.out',
      });
      gsap.to(sprite.scale, {
        x: 0.6, y: 0.6,
        duration: 0.6,
        delay: 0.4 + (i / count) * 0.15,
        ease: 'power2.out',
      });
      gsap.to(sprite, {
        alpha: 0,
        duration: 0.4,
        delay: 1.2 + (i / count) * 0.15,
        ease: 'power2.in',
      });
    }
  },

  spawnEmberBurst(container, W, H, tier, renderer) {
    const max = scaleCount(tier === 'LEGENDARY' ? 220 : tier === 'EPIC' ? 140 : 80);
    const burstDur = tier === 'LEGENDARY' ? 0.8 : 0.5;
    const cx = W / 2, cy = H / 2;
    const texture = getEmberTexture(renderer);

    const emitter = new Emitter(container, {
      lifetime: { min: 1.2, max: 2.4 },
      frequency: 0.002,
      emitterLifetime: burstDur,
      maxParticles: max,
      pos: { x: cx, y: cy },
      autoUpdate: true,
      behaviors: [
        { type: 'alpha', config: { alpha: { list: [{ value: 1, time: 0 }, { value: 0, time: 1 }] } } },
        { type: 'scale', config: { scale: { list: [{ value: 0.9, time: 0 }, { value: 0.15, time: 1 }] }, minMult: 0.5 } },
        { type: 'color', config: { color: { list: [
          { value: 'fff5d6', time: 0 }, { value: 'f39c12', time: 0.5 }, { value: 'd35400', time: 1 },
        ] } } },
        { type: 'moveSpeed', config: { speed: { list: [{ value: 320, time: 0 }, { value: 60, time: 1 }] }, minMult: 0.4 } },
        { type: 'moveAcceleration', config: { accel: { x: 0, y: 240 } } },
        { type: 'rotationStatic', config: { min: 0, max: 360 } },
        { type: 'spawnShape', config: { type: 'torus', data: { x: 0, y: 0, radius: 8, innerRadius: 0, affectRotation: false } } },
        { type: 'textureSingle', config: { texture } },
      ],
    });
    emitter.emit = true;
    // Guard against double-destroy: if overlay was destroyed early (player
    // closed celebration or error path), the emitter may already be torn down.
    setTimeout(() => {
      if (emitter && typeof emitter.destroy === 'function' && !emitter._origConfig?.destroyed) {
        try { emitter.destroy(); } catch {}
      }
    }, (burstDur + 3) * 1000);
  },

  lightningFlash(overlay, W, H) {
    const flash = new PIXI.Graphics();
    flash.beginFill(0xffffff, 1);
    flash.drawRect(0, 0, W, H);
    flash.endFill();
    flash.alpha = 0;
    overlay.addChild(flash);
    gsap.timeline()
      .to(flash, { alpha: 0.8, duration: 0.08 })
      .to(flash, { alpha: 0, duration: 0.3 })
      .to(flash, { alpha: 0.5, duration: 0.06, delay: 0.2 })
      .to(flash, { alpha: 0, duration: 0.4 });
  },

  rollCounter(el, from, to, durMs, onComplete) {
    const obj = { val: from };
    gsap.to(obj, {
      val: to, duration: durMs / 1000, ease: 'power1.out',
      onUpdate: () => { el.textContent = fmtMoney(obj.val); },
      onComplete: () => {
        el.textContent = fmtMoney(to);
        if (onComplete) onComplete();
      },
    });
  },
};

// Preload tier label images via raw Image() — bypasses PIXI cache.
// PIXI.Texture.from() in play() will load from cached HTTP resource without
// triggering "BaseTexture added to cache" warning.
[ASSET_PATH.WIN_BIG, ASSET_PATH.WIN_MEGA, ASSET_PATH.WIN_EPIC, ASSET_PATH.WIN_LEGENDARY].forEach(p => {
  try {
    const img = new Image();
    img.src = p;
  } catch {}
});
