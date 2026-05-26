import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import { GlowFilter } from '@pixi/filter-glow';
import { FREE_SPIN_AWARDS, FREE_SPIN_RETRIGGER, ASSET_PATH, fmtMoney } from './config.js';
import { WinCelebration } from './winCelebration.js';
import { Audio } from './audio.js';

export const FreeSpin = {
  active: false,
  remaining: 0,
  total: 0,
  totalWonInBonus: 0,

  start(scatterCount) {
    const award = FREE_SPIN_AWARDS[Math.min(scatterCount, 5)];
    if (!award) return null;
    this.active = true;
    this.remaining = award.spins;
    this.total = award.spins;
    this.totalWonInBonus = 0;
    return award;
  },

  consume() {
    if (!this.active) return null;
    this.remaining--;
    if (this.remaining <= 0) {
      const summary = {
        totalWon: this.totalWonInBonus,
        spinsPlayed: this.total,
      };
      this.active = false;
      this.remaining = 0;
      this.totalWonInBonus = 0;
      return summary;
    }
    return null;
  },

  retrigger(scatterCount) {
    const add = FREE_SPIN_RETRIGGER[Math.min(scatterCount, 5)];
    if (!add) return null;
    this.remaining += add;
    this.total += add;
    return { addSpins: add };
  },

  addWin(amount) { this.totalWonInBonus += amount; },
};

export function showTransitionIntro(app, stage, scatterCount, award, startMult, onComplete) {
  const overlay = new PIXI.Container();
  stage.addChild(overlay);
  // CRITICAL: divide by stage.scale to use stage-local coords (overlay inherits stage transform).
  // Without this, positions/sizes are double-scaled and content overflows canvas.
  const stageScale = stage.scale.x || 1;
  const W = app.screen.width / stageScale;
  const H = app.screen.height / stageScale;
  const cx = W / 2, cy = H / 2;
  const stageOriginX = stage.x, stageOriginY = stage.y;
  // Text scale factor: design width is 577. On narrow phones (A06 stage-local W ~306)
  // we clamp to 0.55 so "FREE SPINS!" still fits without horizontal clipping.
  const tScale = Math.max(0.55, Math.min(1, W / 577));
  // Tier mapping for particle counts (more scatter = bigger celebration)
  const tier = scatterCount >= 5 ? 'LEGENDARY' : scatterCount >= 4 ? 'EPIC' : 'MEGA';

  // 1. Deep dark dim
  const dim = new PIXI.Graphics();
  dim.beginFill(0x0a0202, 0.96);
  dim.drawRect(0, 0, W, H);
  dim.endFill();
  dim.alpha = 0;
  overlay.addChild(dim);

  // 2. Sun rays burst (rotating behind coffin)
  const rays = new PIXI.Graphics();
  const rayCount = 18;
  const rayLength = Math.max(W, H);
  rays.beginFill(0xf39c12, 0.22);
  for (let i = 0; i < rayCount; i++) {
    const a1 = (i / rayCount) * Math.PI * 2;
    const a2 = a1 + (Math.PI * 2 / rayCount) * 0.42;
    rays.moveTo(0, 0);
    rays.lineTo(Math.cos(a1) * rayLength, Math.sin(a1) * rayLength);
    rays.lineTo(Math.cos(a2) * rayLength, Math.sin(a2) * rayLength);
    rays.lineTo(0, 0);
  }
  rays.endFill();
  rays.x = cx; rays.y = cy;
  rays.alpha = 0;
  overlay.addChild(rays);

  // 3. Radial gold halo behind coffin
  const halo = new PIXI.Graphics();
  for (let r = 320; r > 0; r -= 20) {
    halo.beginFill(0xf39c12, 0.032);
    halo.drawCircle(0, 0, r);
    halo.endFill();
  }
  halo.x = cx; halo.y = cy - 40;
  halo.alpha = 0;
  halo.scale.set(0.5);
  overlay.addChild(halo);

  // 4. Particle layers
  const coinLayer = new PIXI.Container();
  const confettiLayer = new PIXI.Container();
  overlay.addChild(coinLayer);
  overlay.addChild(confettiLayer);

  // 5. Coffin — rise from below + gold glow filter
  const coffinTex = PIXI.Assets.cache.get(ASSET_PATH.COFFIN) || PIXI.Texture.from(ASSET_PATH.COFFIN);
  const coffin = new PIXI.Sprite(coffinTex);
  coffin.anchor.set(0.5);
  coffin.x = cx;
  coffin.y = H + 120;
  const tw = coffin.texture.orig ? coffin.texture.orig.width : 512;
  const targetScale = (Math.min(W, H) * 0.5) / tw;
  coffin.scale.set(targetScale * 0.3);
  coffin.alpha = 0;
  coffin.rotation = -0.35;
  // Gold glow filter — try/finally restore guaranteed
  const _origWarn = console.warn;
  console.warn = () => {};
  let coffinGlow;
  try {
    coffinGlow = new GlowFilter({
      distance: 28, outerStrength: 3.5, innerStrength: 0,
      color: 0xf39c12, quality: 0.5,
    });
  } finally {
    console.warn = _origWarn;
  }
  coffin.filters = [coffinGlow];
  overlay.addChild(coffin);

  // 6. Title — bigger + dramatic gold gradient + drop shadow
  const titleSettleY = cy + 110;
  const title = new PIXI.Text('FREE SPINS!', new PIXI.TextStyle({
    fontFamily: 'Cinzel, Georgia', fontSize: 56 * tScale, fontWeight: '900',
    fill: ['#fff5d6', '#ffd86b', '#f39c12', '#d35400'],
    stroke: '#1a0808', strokeThickness: 8 * tScale,
    dropShadow: true, dropShadowColor: '#000000', dropShadowBlur: 12, dropShadowDistance: 5,
    letterSpacing: 3 * tScale,
  }));
  title.anchor.set(0.5);
  title.x = cx;
  title.y = titleSettleY - 70;
  title.scale.set(0);
  title.rotation = -Math.PI * 2; // 360° backspin entrance
  overlay.addChild(title);

  // 7. Detail
  const detail = new PIXI.Text(
    `${scatterCount} COFFINS  •  ${award.spins} SPINS  •  ${startMult}× MULTIPLIER`,
    new PIXI.TextStyle({
      fontFamily: 'Cinzel, Georgia', fontSize: 18 * tScale, fontWeight: 'bold',
      fill: '#f7c873', stroke: '#5b1818', strokeThickness: 3,
      letterSpacing: 1.5 * tScale,
    })
  );
  detail.anchor.set(0.5);
  detail.x = cx;
  detail.y = cy + 170;
  detail.alpha = 0;
  overlay.addChild(detail);

  // Tracking for cleanup
  let raysTween = null;
  let shakeTl = null;

  const tl = gsap.timeline({
    onComplete: () => {
      if (raysTween) raysTween.kill();
      if (shakeTl) shakeTl.kill();
      gsap.killTweensOf(stage);
      stage.x = stageOriginX;
      stage.y = stageOriginY;
      // Kill all child sprite tweens before destroy (prevent orphan tween crashes)
      [coinLayer, confettiLayer].forEach(layer => {
        if (!layer || !layer.children) return;
        layer.children.forEach(c => {
          gsap.killTweensOf(c);
          if (c.scale) gsap.killTweensOf(c.scale);
        });
      });
      overlay.destroy({ children: true });
      if (onComplete) onComplete();
    },
  });

  tl
    .to(dim, { alpha: 1, duration: 0.5 })
    .to(rays, { alpha: 1, duration: 0.5 }, '-=0.2')
    .to(halo, { alpha: 1, duration: 0.6 }, '-=0.3')
    .to(halo.scale, { x: 1.4, y: 1.4, duration: 1.2, ease: 'power2.out' }, '-=0.6')
    // Coffin rise + scale + rotation settle
    .to(coffin, { y: cy - 40, alpha: 1, rotation: 0, duration: 0.95, ease: 'back.out(1.4)' }, '-=0.7')
    .to(coffin.scale, { x: targetScale, y: targetScale, duration: 0.95, ease: 'back.out(1.8)' }, '<')
    // Title entrance: rotation + drop + scale (label spin)
    .to(title, { rotation: 0, duration: 0.8, ease: 'power3.out' }, '-=0.25')
    .to(title, { y: titleSettleY, duration: 0.7, ease: 'back.out(1.8)' }, '<')
    .to(title.scale, { x: 1.3, y: 1.3, duration: 0.6, ease: 'back.out(2.5)' }, '<')
    .to(title.scale, { x: 1, y: 1, duration: 0.25, ease: 'power2.out' })
    // Wobble settle
    .to(title, { rotation: 0.1, duration: 0.12, ease: 'sine.inOut' })
    .to(title, { rotation: -0.06, duration: 0.12, ease: 'sine.inOut' })
    .to(title, { rotation: 0, duration: 0.1, ease: 'sine.out' })
    .to(detail, { alpha: 1, duration: 0.3 })
    .to({}, { duration: 1.6 })
    .to(overlay, { alpha: 0, duration: 0.55, ease: 'power2.in' });

  // Continuous rays rotation
  raysTween = gsap.to(rays, {
    rotation: Math.PI * 2,
    duration: tier === 'LEGENDARY' ? 10 : 12,
    repeat: -1,
    ease: 'none',
  });

  // Camera shake when coffin lands + title pops (approx 1.2s into timeline)
  shakeTl = gsap.timeline({ delay: 1.2 });
  const shakeAmp = tier === 'LEGENDARY' ? 18 : tier === 'EPIC' ? 13 : 9;
  for (let i = 0; i < 12; i++) {
    const decay = Math.pow(0.9, i);
    const dx = (Math.random() - 0.5) * 2 * shakeAmp * decay;
    const dy = (Math.random() - 0.5) * 2 * shakeAmp * decay;
    shakeTl.to(stage, { x: stageOriginX + dx, y: stageOriginY + dy, duration: 0.04, ease: 'sine.inOut' });
  }
  shakeTl.to(stage, { x: stageOriginX, y: stageOriginY, duration: 0.12, ease: 'power2.out' });

  // Coin shower (delay so coffin appears first)
  setTimeout(() => {
    WinCelebration.spawnCoinShower(coinLayer, W, H, tier, app.renderer);
  }, 1100);
  // Confetti (slightly after coins)
  setTimeout(() => {
    WinCelebration.spawnConfetti(confettiLayer, W, H, tier, app.renderer);
  }, 1300);
}

// Phase J — Cinematic FS exit transition (mirror of showTransitionIntro).
// Sun rays + halo + title spin entrance + counter rolling with coinTick audio +
// coin shower + papel picado confetti + camera shake. Ends with smooth fade.
export function showSummary(app, stage, summary, onComplete) {
  const overlay = new PIXI.Container();
  stage.addChild(overlay);
  // Stage-local coords (same fix as WinCelebration + showTransitionIntro)
  const stageScale = stage.scale.x || 1;
  const W = app.screen.width / stageScale;
  const H = app.screen.height / stageScale;
  const cx = W / 2, cy = H / 2;
  const stageOriginX = stage.x, stageOriginY = stage.y;
  // Text scale factor — same as showTransitionIntro: clamp at 0.55 so titles fit on narrow phones.
  const tScale = Math.max(0.55, Math.min(1, W / 577));
  // Tier — use EPIC for moderate celebration, LEGENDARY if big totalWon (>100x bet typically)
  const totalWon = summary.totalWon || 0;
  const tier = totalWon >= 5000 ? 'LEGENDARY' : 'EPIC';

  // 1. Deep dark dim
  const dim = new PIXI.Graphics();
  dim.beginFill(0x0a0202, 0.94);
  dim.drawRect(0, 0, W, H);
  dim.endFill();
  dim.alpha = 0;
  overlay.addChild(dim);

  // 2. Sun rays burst (rotating)
  const rays = new PIXI.Graphics();
  const rayCount = 18;
  const rayLength = Math.max(W, H);
  rays.beginFill(0xf39c12, 0.22);
  for (let i = 0; i < rayCount; i++) {
    const a1 = (i / rayCount) * Math.PI * 2;
    const a2 = a1 + (Math.PI * 2 / rayCount) * 0.42;
    rays.moveTo(0, 0);
    rays.lineTo(Math.cos(a1) * rayLength, Math.sin(a1) * rayLength);
    rays.lineTo(Math.cos(a2) * rayLength, Math.sin(a2) * rayLength);
    rays.lineTo(0, 0);
  }
  rays.endFill();
  rays.x = cx; rays.y = cy;
  rays.alpha = 0;
  overlay.addChild(rays);

  // 3. Radial gold halo
  const halo = new PIXI.Graphics();
  for (let r = 320; r > 0; r -= 20) {
    halo.beginFill(0xf39c12, 0.032);
    halo.drawCircle(0, 0, r);
    halo.endFill();
  }
  halo.x = cx; halo.y = cy;
  halo.alpha = 0;
  halo.scale.set(0.5);
  overlay.addChild(halo);

  // 4. Particle + sparkle layers
  const coinLayer = new PIXI.Container();
  const confettiLayer = new PIXI.Container();
  const sparkleLayer = new PIXI.Container();
  overlay.addChild(coinLayer);
  overlay.addChild(confettiLayer);
  overlay.addChild(sparkleLayer);

  // 5. "BONUS COMPLETE" title — spin entrance from above
  const titleSettleY = cy - 90;
  const title = new PIXI.Text('BONUS COMPLETE', new PIXI.TextStyle({
    fontFamily: 'Cinzel, Georgia', fontSize: 38 * tScale, fontWeight: '900',
    fill: ['#fff5d6', '#ffd86b', '#f39c12'],
    stroke: '#5b1818', strokeThickness: 5 * tScale,
    dropShadow: true, dropShadowColor: '#000000', dropShadowBlur: 10, dropShadowDistance: 4,
    letterSpacing: 2.5 * tScale,
  }));
  title.anchor.set(0.5);
  title.x = cx;
  title.y = titleSettleY - 60;
  title.scale.set(0);
  title.rotation = -Math.PI * 2;
  overlay.addChild(title);

  // 6. "YOU WON" subtitle
  const totalText = new PIXI.Text('YOU WON', new PIXI.TextStyle({
    fontFamily: 'Cinzel, Georgia', fontSize: 22 * tScale, fontWeight: 'bold',
    fill: '#7dcea0', stroke: '#1a3a30', strokeThickness: 3, letterSpacing: 2 * tScale,
  }));
  totalText.anchor.set(0.5);
  totalText.x = cx; totalText.y = cy - 25;
  totalText.alpha = 0;
  overlay.addChild(totalText);

  // 7. Amount counter (will roll 0 → totalWon)
  const amountSize = (tier === 'LEGENDARY' ? 78 : 64) * tScale;
  const amount = new PIXI.Text('0.00', new PIXI.TextStyle({
    fontFamily: 'Cinzel, Georgia', fontSize: amountSize, fontWeight: '900',
    fill: ['#fff5d6', '#ffd86b', '#f39c12', '#d35400'],
    stroke: '#1a0808', strokeThickness: 6 * tScale,
    dropShadow: true, dropShadowColor: '#f39c12', dropShadowBlur: 14, dropShadowDistance: 0,
    letterSpacing: 2 * tScale,
  }));
  amount.anchor.set(0.5);
  amount.x = cx; amount.y = cy + 45;
  amount.alpha = 0;
  amount.scale.set(0.7);
  overlay.addChild(amount);

  // Tracking for cleanup
  let raysTween = null;
  let shakeTl = null;
  let sparkleInterval = null;
  const counterObj = { val: 0 };
  let lastTickVal = 0;

  const tl = gsap.timeline({
    onComplete: () => {
      if (raysTween) raysTween.kill();
      if (shakeTl) shakeTl.kill();
      if (sparkleInterval) { clearInterval(sparkleInterval); sparkleInterval = null; }
      gsap.killTweensOf(stage);
      stage.x = stageOriginX;
      stage.y = stageOriginY;
      // Kill all child sprite tweens before destroy
      [coinLayer, confettiLayer, sparkleLayer].forEach(layer => {
        if (!layer || !layer.children) return;
        layer.children.forEach(c => {
          gsap.killTweensOf(c);
          if (c.scale) gsap.killTweensOf(c.scale);
        });
      });
      overlay.destroy({ children: true });
      if (onComplete) onComplete();
    },
  });

  const counterDur = tier === 'LEGENDARY' ? 2.6 : 1.8;

  tl
    .to(dim, { alpha: 1, duration: 0.5 })
    .to(rays, { alpha: 1, duration: 0.5 }, '-=0.2')
    .to(halo, { alpha: 1, duration: 0.6 }, '-=0.3')
    .to(halo.scale, { x: 1.3, y: 1.3, duration: 1.0, ease: 'power2.out' }, '-=0.6')
    // Title spin entrance
    .to(title, { rotation: 0, duration: 0.8, ease: 'power3.out' }, '-=0.6')
    .to(title, { y: titleSettleY, duration: 0.7, ease: 'back.out(1.8)' }, '<')
    .to(title.scale, { x: 1.25, y: 1.25, duration: 0.6, ease: 'back.out(2.5)' }, '<')
    .to(title.scale, { x: 1, y: 1, duration: 0.22, ease: 'power2.out' })
    // Wobble settle title
    .to(title, { rotation: 0.08, duration: 0.12, ease: 'sine.inOut' })
    .to(title, { rotation: -0.05, duration: 0.12, ease: 'sine.inOut' })
    .to(title, { rotation: 0, duration: 0.1, ease: 'sine.out' })
    // Subtitle "YOU WON" fade in
    .to(totalText, { alpha: 1, duration: 0.35 })
    // Amount appear + scale settle
    .to(amount, { alpha: 1, duration: 0.3 }, '-=0.1')
    .to(amount.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2)' }, '<')
    // Counter rolling from 0 → totalWon with coinTick audio per tick
    .to(counterObj, {
      val: totalWon,
      duration: counterDur,
      ease: tier === 'LEGENDARY' ? 'power2.inOut' : 'power1.out',
      onStart: () => {
        // Start sparkle trails around amount
        const intervalMs = tier === 'LEGENDARY' ? 50 : 80;
        sparkleInterval = setInterval(() => {
          WinCelebration.spawnSparkle(sparkleLayer, amount.x, amount.y, app.renderer);
          if (tier === 'LEGENDARY') {
            WinCelebration.spawnSparkle(sparkleLayer, amount.x, amount.y, app.renderer);
          }
        }, intervalMs);
      },
      onComplete: () => {
        if (sparkleInterval) { clearInterval(sparkleInterval); sparkleInterval = null; }
      },
      onUpdate: () => {
        const v = counterObj.val;
        amount.text = fmtMoney(v);
        // Audio tick: every X amount + pitch scales with accumulated value
        if (v - lastTickVal > totalWon / 30) {
          Audio.coinTick?.(v);
          lastTickVal = v;
        }
      },
    })
    // Amount pulse pop after counter finishes
    .to(amount.scale, { x: 1.15, y: 1.15, duration: 0.18, ease: 'back.out(3)' })
    .to(amount.scale, { x: 1, y: 1, duration: 0.25, ease: 'sine.inOut' })
    // Hold briefly
    .to({}, { duration: 1.2 })
    // Fade out
    .to(overlay, { alpha: 0, duration: 0.55, ease: 'power2.in' });

  // Continuous rays rotation
  raysTween = gsap.to(rays, {
    rotation: Math.PI * 2,
    duration: tier === 'LEGENDARY' ? 10 : 12,
    repeat: -1,
    ease: 'none',
  });

  // Camera shake when title pops (~1.0s into timeline)
  shakeTl = gsap.timeline({ delay: 1.0 });
  const shakeAmp = tier === 'LEGENDARY' ? 14 : 9;
  for (let i = 0; i < 10; i++) {
    const decay = Math.pow(0.9, i);
    const dx = (Math.random() - 0.5) * 2 * shakeAmp * decay;
    const dy = (Math.random() - 0.5) * 2 * shakeAmp * decay;
    shakeTl.to(stage, { x: stageOriginX + dx, y: stageOriginY + dy, duration: 0.04, ease: 'sine.inOut' });
  }
  shakeTl.to(stage, { x: stageOriginX, y: stageOriginY, duration: 0.12, ease: 'power2.out' });

  // Coin shower (delay so title appears first)
  setTimeout(() => {
    WinCelebration.spawnCoinShower(coinLayer, W, H, tier, app.renderer);
  }, 900);
  // Confetti (slightly after coins)
  setTimeout(() => {
    WinCelebration.spawnConfetti(confettiLayer, W, H, tier, app.renderer);
  }, 1100);

  // FIREWORKS — burst at counter completion (gold/red/green starbursts radiating
  // from the amount text). Multiple bursts at random positions for spectacle.
  // Timing: starts ~when counter finishes rolling (counterDur + intro buildup ~1.2s).
  const fireworksStartMs = (1.2 + counterDur) * 1000 + 100;
  const burstCount = tier === 'LEGENDARY' ? 7 : 4;
  for (let b = 0; b < burstCount; b++) {
    setTimeout(() => {
      if (overlay.destroyed) return;
      const colors = [0xffd86b, 0xf39c12, 0xff5252, 0x7dffb0, 0xfff5d6, 0xff7a8a];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const bx = cx + (Math.random() - 0.5) * W * 0.6;
      const by = cy - 60 + (Math.random() - 0.5) * H * 0.35;
      spawnFirework(overlay, bx, by, color, app.renderer);
    }, fireworksStartMs + b * 180);
  }
}

/* ---------- Firework helper ---------- */
// Single starburst: spawns ~16 small particles radiating outward + fade.
// Used by showSummary at counter completion. Self-cleans on tween end.
function spawnFirework(parent, cx, cy, color, renderer) {
  if (!parent || parent.destroyed) return;
  const N = 16;
  // Particle texture: small bright circle, cached per-renderer for perf
  if (!spawnFirework._tex) {
    const g = new PIXI.Graphics();
    for (let i = 0; i < 5; i++) {
      g.beginFill(0xffffff, 0.7 - i * 0.12);
      g.drawCircle(0, 0, 5 + i * 2);
      g.endFill();
    }
    spawnFirework._tex = renderer.generateTexture(g);
  }
  const particles = [];
  for (let i = 0; i < N; i++) {
    const p = new PIXI.Sprite(spawnFirework._tex);
    p.anchor.set(0.5);
    p.x = cx; p.y = cy;
    p.tint = color;
    p.scale.set(0.6);
    p.alpha = 1;
    p.blendMode = PIXI.BLEND_MODES.ADD;
    parent.addChild(p);
    particles.push(p);
    const angle = (i / N) * Math.PI * 2 + Math.random() * 0.18;
    const dist = 80 + Math.random() * 80;
    const dur = 0.65 + Math.random() * 0.35;
    gsap.to(p, {
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist + 30, // slight gravity dip
      alpha: 0,
      duration: dur,
      ease: 'power2.out',
      onComplete: () => {
        gsap.killTweensOf(p);
        if (p.parent) p.parent.removeChild(p);
        if (!p.destroyed) p.destroy();
      },
    });
    gsap.to(p.scale, {
      x: 0.15, y: 0.15,
      duration: dur,
      ease: 'power2.in',
    });
  }
  // Bright center flash
  const flash = new PIXI.Sprite(spawnFirework._tex);
  flash.anchor.set(0.5);
  flash.x = cx; flash.y = cy;
  flash.tint = 0xffffff;
  flash.scale.set(2.5);
  flash.alpha = 1;
  flash.blendMode = PIXI.BLEND_MODES.ADD;
  parent.addChild(flash);
  gsap.to(flash, {
    alpha: 0, duration: 0.4, ease: 'power2.out',
    onComplete: () => {
      gsap.killTweensOf(flash);
      if (flash.parent) flash.parent.removeChild(flash);
      if (!flash.destroyed) flash.destroy();
    },
  });
  gsap.to(flash.scale, { x: 4.5, y: 4.5, duration: 0.4, ease: 'power2.out' });
}
