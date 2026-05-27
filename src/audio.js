const AUDIO_STORAGE_KEY = 'calavera_audio';

export const Audio = {
  ctx: null,
  masterGain: null,
  sfxGain: null,
  enabled: true,
  masterVol: 1.0,
  sfxVol: 0.5,

  load() {
    try {
      const s = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) || '{}');
      if (typeof s.master === 'number') this.masterVol = Math.max(0, Math.min(1, s.master));
      if (typeof s.sfx === 'number')    this.sfxVol    = Math.max(0, Math.min(1, s.sfx));
      if (typeof s.enabled === 'boolean') this.enabled = s.enabled;
    } catch (_) {}
  },

  save() {
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({
        master: this.masterVol, sfx: this.sfxVol, enabled: this.enabled,
      }));
    } catch (_) {}
  },

  init() {
    if (this.ctx) return;
    this.load();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.enabled ? this.masterVol : 0;
    this.masterGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.masterGain);
    // Separate gain for music so it can be ducked/faded independently.
    // Default 0.28 — audible as ambient layer but doesn't compete with SFX.
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.28;
    this.musicGain.connect(this.masterGain);
    this._loginMusic = null;

    const resume = () => {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('keydown', resume);
    };
    document.addEventListener('pointerdown', resume);
    document.addEventListener('keydown', resume);

    // Hybrid: preload sample files (non-blocking; synth fallback works if missing)
    this.loadSamples();
  },

  // Login screen ambient loop — Día de los Muertos themed (D minor pad + plucked arpeggio).
  // 4-chord progression (Dm → Am → F → C), each chord 4 beats, loop ~16s.
  playLoginMusic() {
    if (!this.enabled || !this.ctx || this._loginMusic) return;
    const ctx = this.ctx;
    const dest = this.musicGain;
    const start = ctx.currentTime + 0.1;
    const BPM = 80, beat = 60 / BPM;             // beat duration in seconds
    const chordDur = beat * 4;                   // 4 beats per chord
    const loopDur = chordDur * 4;                // 16 beats per full loop

    // Chord roots (D minor diatonic in low octave: D2/A2/F2/C3)
    const chords = [
      { root: 73.42,  notes: [146.83, 174.61, 220.00, 293.66] }, // Dm: D F A D
      { root: 110.00, notes: [220.00, 261.63, 329.63, 440.00] }, // Am: A C E A
      { root: 87.31,  notes: [174.61, 220.00, 261.63, 349.23] }, // F:  F A C F
      { root: 130.81, notes: [261.63, 329.63, 392.00, 523.25] }, // C:  C E G C
    ];

    const allNodes = [];

    const scheduleLoop = (offset) => {
      chords.forEach((ch, idx) => {
        const tStart = start + offset + idx * chordDur;

        // BASS PAD — long sine note on the root
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.value = ch.root;
        bassGain.gain.setValueAtTime(0, tStart);
        bassGain.gain.linearRampToValueAtTime(0.6, tStart + 0.6);
        bassGain.gain.linearRampToValueAtTime(0.5, tStart + chordDur - 0.5);
        bassGain.gain.linearRampToValueAtTime(0, tStart + chordDur);
        bassOsc.connect(bassGain).connect(dest);
        bassOsc.start(tStart);
        bassOsc.stop(tStart + chordDur + 0.1);
        allNodes.push(bassOsc, bassGain);

        // PLUCKED ARPEGGIO — triangle wave with quick pluck envelope
        ch.notes.forEach((freq, n) => {
          const tNote = tStart + n * beat;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          // Pluck envelope: instant attack, exponential decay
          gain.gain.setValueAtTime(0.0001, tNote);
          gain.gain.exponentialRampToValueAtTime(0.32, tNote + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, tNote + beat * 0.95);
          osc.connect(gain).connect(dest);
          osc.start(tNote);
          osc.stop(tNote + beat);
          allNodes.push(osc, gain);
        });
      });
    };

    // Schedule first 2 loops; setInterval will keep scheduling future loops
    scheduleLoop(0);
    scheduleLoop(loopDur);
    let nextOffset = loopDur * 2;
    const refill = setInterval(() => {
      if (!this._loginMusic) { clearInterval(refill); return; }
      scheduleLoop(nextOffset);
      nextOffset += loopDur;
    }, loopDur * 1000);

    this._loginMusic = { allNodes, refill };
  },

  stopLoginMusic(fadeMs = 800) {
    if (!this.ctx || !this._loginMusic) return;
    const { refill } = this._loginMusic;
    clearInterval(refill);
    // Fade musicGain down smoothly then back up after stop
    const t = this.ctx.currentTime;
    const g = this.musicGain;
    const cur = g.gain.value;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(cur, t);
    g.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    // Restore gain after fade so future music plays normally
    setTimeout(() => { g.gain.value = 0.18; }, fadeMs + 100);
    this._loginMusic = null;
  },

  // Menu music — dark dramatic Día de los Muertos atmosphere.
  // Progression Dm → A → Gm → A (i-V-iv-V in D minor, eerie cadence), 100 BPM slow.
  // Features: low rumble drone (continuous), detuned chorus pad (creates beating
  // shimmer), sparse arpeggio with held notes, ghostly high whistle accent.
  playMenuMusic() {
    if (!this.enabled || !this.ctx || this._menuMusic) return;
    const ctx = this.ctx;
    const dest = this.musicGain;
    const start = ctx.currentTime + 0.1;
    const BPM = 100, beat = 60 / BPM;
    const chordDur = beat * 4;
    const loopDur = chordDur * 4;

    // D minor harmonic — classic "spooky" mode
    const chords = [
      { root: 73.42,  bassLow: 36.71, notes: [146.83, 174.61, 220.00], top: 587.33, accent: 'low' },  // Dm
      { root: 110.00, bassLow: 55.00, notes: [220.00, 277.18, 329.63], top: 880.00, accent: 'mid' },  // A (V — picardy)
      { root: 98.00,  bassLow: 49.00, notes: [196.00, 233.08, 293.66], top: 783.99, accent: 'low' },  // Gm (iv)
      { root: 110.00, bassLow: 55.00, notes: [220.00, 277.18, 329.63], top: 880.00, accent: 'high' }, // A (V) again
    ];

    // CONTINUOUS LOW DRONE — perpetual D in deep register (rumble)
    const droneOsc = ctx.createOscillator();
    const droneGain = ctx.createGain();
    droneOsc.type = 'sine';
    droneOsc.frequency.value = 36.71; // D1
    droneGain.gain.setValueAtTime(0, start);
    droneGain.gain.linearRampToValueAtTime(0.35, start + 1.5);
    droneOsc.connect(droneGain).connect(dest);
    droneOsc.start(start);

    const scheduleLoop = (offset) => {
      chords.forEach((ch, idx) => {
        const tStart = start + offset + idx * chordDur;

        // CHORUS PAD — two detuned sines (creates eerie beating/shimmer)
        for (const detune of [-7, +7]) { // cents detuning, in Hz approximation
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = ch.root * (1 + detune / 1000); // micro detune
          gain.gain.setValueAtTime(0, tStart);
          gain.gain.linearRampToValueAtTime(0.32, tStart + 0.8);
          gain.gain.linearRampToValueAtTime(0.26, tStart + chordDur - 0.4);
          gain.gain.linearRampToValueAtTime(0, tStart + chordDur);
          osc.connect(gain).connect(dest);
          osc.start(tStart);
          osc.stop(tStart + chordDur + 0.1);
        }

        // SPARSE arpeggio — only 3 notes per chord with longer hold (more space = tension)
        ch.notes.forEach((freq, n) => {
          const tNote = tStart + n * beat * 1.3;       // staggered, not on the beat
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, tNote);
          gain.gain.exponentialRampToValueAtTime(0.22, tNote + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, tNote + beat * 1.4);
          osc.connect(gain).connect(dest);
          osc.start(tNote);
          osc.stop(tNote + beat * 1.5);
        });

        // GHOSTLY HIGH WHISTLE — soft top octave, sine with slow attack/release
        const tTop = tStart + beat * 0.5;
        const topOsc = ctx.createOscillator();
        const topGain = ctx.createGain();
        topOsc.type = 'sine';
        topOsc.frequency.value = ch.top;
        // Light vibrato for haunted feel
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 4.5;
        lfoGain.gain.value = 6;
        lfo.connect(lfoGain).connect(topOsc.frequency);
        topGain.gain.setValueAtTime(0, tTop);
        topGain.gain.linearRampToValueAtTime(0.13, tTop + 0.7);
        topGain.gain.linearRampToValueAtTime(0, tTop + beat * 3);
        topOsc.connect(topGain).connect(dest);
        topOsc.start(tTop);
        lfo.start(tTop);
        topOsc.stop(tTop + beat * 3.1);
        lfo.stop(tTop + beat * 3.1);

        // DRAMATIC ACCENT on last chord — single low rumble hit
        if (ch.accent === 'high' && idx === chords.length - 1) {
          const accOsc = ctx.createOscillator();
          const accGain = ctx.createGain();
          accOsc.type = 'sawtooth';
          accOsc.frequency.value = ch.bassLow * 2;
          accGain.gain.setValueAtTime(0.0001, tStart + chordDur - beat);
          accGain.gain.exponentialRampToValueAtTime(0.18, tStart + chordDur - beat + 0.05);
          accGain.gain.exponentialRampToValueAtTime(0.0001, tStart + chordDur);
          accOsc.connect(accGain).connect(dest);
          accOsc.start(tStart + chordDur - beat);
          accOsc.stop(tStart + chordDur + 0.1);
        }
      });
    };

    scheduleLoop(0);
    scheduleLoop(loopDur);
    let nextOffset = loopDur * 2;
    const refill = setInterval(() => {
      if (!this._menuMusic) { clearInterval(refill); return; }
      scheduleLoop(nextOffset);
      nextOffset += loopDur;
    }, loopDur * 1000);

    this._menuMusic = { refill, droneOsc, droneGain };
  },

  stopMenuMusic(fadeMs = 800) {
    if (!this.ctx || !this._menuMusic) return;
    const { refill, droneOsc, droneGain } = this._menuMusic;
    clearInterval(refill);
    const t = this.ctx.currentTime;
    const g = this.musicGain;
    const cur = g.gain.value;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(cur, t);
    g.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    // Fade drone separately then stop oscillator
    if (droneGain) {
      droneGain.gain.cancelScheduledValues(t);
      droneGain.gain.setValueAtTime(droneGain.gain.value, t);
      droneGain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    }
    if (droneOsc) {
      try { droneOsc.stop(t + fadeMs / 1000 + 0.1); } catch {}
    }
    setTimeout(() => { g.gain.value = 0.18; }, fadeMs + 100);
    this._menuMusic = null;
  },

  // Base game ambient music — subtle Mexican folk feel, doesn't compete with SFX.
  // D major (brighter than menu) at 90 BPM, I-V-vi-IV progression (optimistic pop).
  // Lower volume (0.10) so spin SFX cuts through cleanly.
  playGameMusic() {
    if (!this.enabled || !this.ctx || this._gameMusic) return;
    const ctx = this.ctx;
    // Use a separate quieter gain so it sits behind SFX
    const dest = ctx.createGain();
    dest.gain.value = 0.55;
    dest.connect(this.musicGain);

    const start = ctx.currentTime + 0.1;
    const BPM = 90, beat = 60 / BPM;
    const chordDur = beat * 4;
    const loopDur = chordDur * 4;

    // D major progression: D (I) - A (V) - Bm (vi) - G (IV)
    const chords = [
      { root: 73.42,  notes: [146.83, 220.00, 293.66] }, // D:  D A D
      { root: 110.00, notes: [220.00, 277.18, 329.63] }, // A:  A C# E
      { root: 123.47, notes: [246.94, 293.66, 369.99] }, // Bm: B D F#
      { root: 98.00,  notes: [196.00, 246.94, 293.66] }, // G:  G B D
    ];

    // Trumpet melody pattern — characteristic mariachi flavor.
    // Pentatonic-ish phrase per chord (relative to root). Values in semitone offsets.
    const trumpetPhrases = [
      [0, 7, 12, 7, 4, 7, 12, 0],  // D: D A D' A F# A D' D
      [0, 4, 7, 12, 7, 4, 0, 7],   // A: A C# E A' E C# A E
      [0, 3, 7, 10, 7, 3, 0, 3],   // Bm: B D F# A F# D B D
      [0, 4, 7, 12, 7, 4, 7, 12],  // G: G B D G' D B D G'
    ];
    const semitoneToFreq = (root, semi) => root * Math.pow(2, semi / 12);

    const scheduleLoop = (offset) => {
      chords.forEach((ch, idx) => {
        const tStart = start + offset + idx * chordDur;

        // BASS pad (very soft, in background)
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.value = ch.root;
        bassGain.gain.setValueAtTime(0, tStart);
        bassGain.gain.linearRampToValueAtTime(0.4, tStart + 0.6);
        bassGain.gain.linearRampToValueAtTime(0.35, tStart + chordDur - 0.4);
        bassGain.gain.linearRampToValueAtTime(0, tStart + chordDur);
        bassOsc.connect(bassGain).connect(dest);
        bassOsc.start(tStart);
        bassOsc.stop(tStart + chordDur + 0.1);

        // SOFT arpeggio (triangle, very gentle pluck) — guitar-like rhythm chord
        ch.notes.forEach((freq, n) => {
          const tNote = tStart + n * beat * 1.3;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, tNote);
          gain.gain.exponentialRampToValueAtTime(0.18, tNote + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, tNote + beat * 1.2);
          osc.connect(gain).connect(dest);
          osc.start(tNote);
          osc.stop(tNote + beat * 1.3);
        });

        // TRUMPET melody — mariachi signature lead with vibrato + soft attack.
        // Plays 8 notes across the bar (eighth notes).
        const phrase = trumpetPhrases[idx];
        const trumpetRoot = ch.root * 4; // 2 octaves up — trumpet register
        phrase.forEach((semi, n) => {
          const tNote = tStart + n * (beat / 2);
          const noteDur = beat * 0.45;
          const freq = semitoneToFreq(trumpetRoot, semi);
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.value = freq;
          // Vibrato — characteristic trumpet warble
          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          lfo.frequency.value = 5.5;
          lfoGain.gain.value = freq * 0.008;
          lfo.connect(lfoGain).connect(osc.frequency);
          // Bright filter (brass-like)
          filter.type = 'lowpass';
          filter.frequency.value = 2400;
          filter.Q.value = 4;
          osc.connect(filter).connect(gain).connect(dest);
          // Soft attack envelope
          gain.gain.setValueAtTime(0.0001, tNote);
          gain.gain.exponentialRampToValueAtTime(0.12, tNote + 0.02);
          gain.gain.linearRampToValueAtTime(0.1, tNote + noteDur * 0.7);
          gain.gain.exponentialRampToValueAtTime(0.0001, tNote + noteDur);
          osc.start(tNote); osc.stop(tNote + noteDur + 0.05);
          lfo.start(tNote); lfo.stop(tNote + noteDur + 0.05);
        });

        // MARACAS shake on off-beats — subtle Mexican percussion
        for (let n = 0; n < 8; n++) {
          if (n % 2 === 0) continue; // off-beats only (8th note pattern)
          const tHit = tStart + n * (beat / 2);
          const buf = ctx.createBuffer(1, 0.05 * ctx.sampleRate, ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.3));
          const noise = ctx.createBufferSource();
          const nf = ctx.createBiquadFilter();
          const ng = ctx.createGain();
          nf.type = 'highpass';
          nf.frequency.value = 5500;
          noise.buffer = buf;
          noise.connect(nf).connect(ng).connect(dest);
          ng.gain.setValueAtTime(0.08, tHit);
          ng.gain.exponentialRampToValueAtTime(0.001, tHit + 0.08);
          noise.start(tHit);
        }
      });
    };

    scheduleLoop(0);
    scheduleLoop(loopDur);
    let nextOffset = loopDur * 2;
    const refill = setInterval(() => {
      if (!this._gameMusic) { clearInterval(refill); return; }
      scheduleLoop(nextOffset);
      nextOffset += loopDur;
    }, loopDur * 1000);

    this._gameMusic = { refill, subGain: dest };
  },

  stopGameMusic(fadeMs = 600) {
    if (!this.ctx || !this._gameMusic) return;
    const { refill, subGain } = this._gameMusic;
    clearInterval(refill);
    if (subGain) {
      const t = this.ctx.currentTime;
      subGain.gain.cancelScheduledValues(t);
      subGain.gain.setValueAtTime(subGain.gain.value, t);
      subGain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    }
    // Cleanup: disconnect audio node after fade
    setTimeout(() => {
      try { if (subGain) subGain.disconnect(); } catch {}
    }, fadeMs + 200);
    this._gameMusic = null;
  },

  // ============================================================
  // E3 — FREE SPIN MUSIC (replaces base game music during bonus round)
  // ============================================================
  // D minor harmonic, BPM 100 (slightly faster than base D-major), darker mood.
  // Progression: Dm - Bb - F - A (i - VI - III - V) — tense, dramatic.
  // Layers: bass pad, plucked chord, continuous soft maraca shake.
  playFreeSpinMusic() {
    if (!this.enabled || !this.ctx || this._fsMusic) return;
    const ctx = this.ctx;
    const dest = ctx.createGain();
    dest.gain.value = 0.6;
    dest.connect(this.musicGain);

    const start = ctx.currentTime + 0.1;
    const BPM = 100, beat = 60 / BPM;
    const chordDur = beat * 4;
    const loopDur = chordDur * 4;

    // D minor: Dm - Bb - F - A
    const chords = [
      { root: 73.42,  notes: [146.83, 174.61, 220.00, 293.66] }, // Dm: D F A D
      { root: 116.54, notes: [233.08, 293.66, 349.23, 466.16] }, // Bb: Bb D F Bb
      { root: 87.31,  notes: [174.61, 220.00, 261.63, 349.23] }, // F:  F A C F
      { root: 110.00, notes: [220.00, 277.18, 329.63, 440.00] }, // A:  A C# E A (dominant tension to resolve back)
    ];

    const scheduleLoop = (offset) => {
      chords.forEach((ch, idx) => {
        const tStart = start + offset + idx * chordDur;

        // BASS pad — long sustained sine
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.value = ch.root;
        bassGain.gain.setValueAtTime(0, tStart);
        bassGain.gain.linearRampToValueAtTime(0.42, tStart + 0.5);
        bassGain.gain.linearRampToValueAtTime(0.38, tStart + chordDur - 0.3);
        bassGain.gain.linearRampToValueAtTime(0, tStart + chordDur);
        bassOsc.connect(bassGain).connect(dest);
        bassOsc.start(tStart);
        bassOsc.stop(tStart + chordDur + 0.1);

        // Plucked chord stab — triangle, short ADSR, hits on beats 1 & 3
        ch.notes.forEach((freq, n) => {
          [0, beat * 2].forEach((beatOffset) => {
            const tNote = tStart + beatOffset + n * 0.015; // tiny arpeggio offset
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, tNote);
            gain.gain.exponentialRampToValueAtTime(0.18, tNote + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.0001, tNote + beat * 1.5);
            osc.connect(gain).connect(dest);
            osc.start(tNote);
            osc.stop(tNote + beat * 1.6);
          });
        });
      });
    };

    scheduleLoop(0);
    scheduleLoop(loopDur);
    let nextOffset = loopDur * 2;
    const refill = setInterval(() => {
      if (!this._fsMusic) { clearInterval(refill); return; }
      scheduleLoop(nextOffset);
      nextOffset += loopDur;
    }, loopDur * 1000);

    // Continuous soft maraca shake (looping noise band-pass at low gain) for tension
    const ns = ctx.createBufferSource();
    const ng = ctx.createGain();
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 4500; nf.Q.value = 1.8;
    const sr = ctx.sampleRate;
    const noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    const nd = noiseBuf.getChannelData(0);
    // Pulsing noise envelope at 8 Hz for shaker texture
    for (let i = 0; i < nd.length; i++) {
      const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * 8 * (i / sr));
      nd[i] = (Math.random() * 2 - 1) * pulse * 0.4;
    }
    ns.buffer = noiseBuf;
    ns.loop = true;
    ns.connect(nf).connect(ng).connect(dest);
    ng.gain.setValueAtTime(0, ctx.currentTime);
    ng.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 1.0);
    ns.start(ctx.currentTime);

    this._fsMusic = { refill, subGain: dest, shaker: ns, shakerGain: ng };
  },

  stopFreeSpinMusic(fadeMs = 600) {
    if (!this.ctx || !this._fsMusic) return;
    const { refill, subGain, shaker, shakerGain } = this._fsMusic;
    clearInterval(refill);
    const t = this.ctx.currentTime;
    if (subGain) {
      subGain.gain.cancelScheduledValues(t);
      subGain.gain.setValueAtTime(subGain.gain.value, t);
      subGain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    }
    if (shakerGain) {
      shakerGain.gain.cancelScheduledValues(t);
      shakerGain.gain.setValueAtTime(shakerGain.gain.value, t);
      shakerGain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    }
    if (shaker) {
      try { shaker.stop(t + fadeMs / 1000 + 0.1); } catch {}
    }
    // Cleanup: disconnect audio nodes after fade completes (prevent accumulation across cycles)
    setTimeout(() => {
      try { if (shaker) shaker.disconnect(); } catch {}
      try { if (shakerGain) shakerGain.disconnect(); } catch {}
      try { if (subGain) subGain.disconnect(); } catch {}
    }, fadeMs + 200);
    this._fsMusic = null;
  },

  // ============================================================
  // E2 — CASCADE INTENSITY MUSIC LAYERS (sync with game music BPM 90)
  // ============================================================
  // setCascadeIntensity(level) adds progressively-denser musical layers
  // ON TOP of base game music as cascadeIter climbs (0=normal, 4+=peak).
  // clearCascadeIntensity() fades all layers when spin cycle ends.
  // Layers: kick (>=1), tambourine offbeat (>=2), brass stab (>=3),
  // sustained choir + cymbal entry (>=4).
  _cascadeLayers: null,

  setCascadeIntensity(level) {
    if (!this.enabled || !this.ctx) return;
    if (!this._cascadeLayers) this._cascadeLayers = {};
    const ctx = this.ctx;
    const BPM = 90, beat = 60 / BPM; // 0.667s per beat
    const dest = this.musicGain;

    const startLayer = (key, intervalSec, fire) => {
      if (this._cascadeLayers[key]) return;
      fire();
      const handle = setInterval(fire, intervalSec * 1000);
      this._cascadeLayers[key] = { stop: () => clearInterval(handle) };
    };

    // L1: kick drum on every beat
    if (level >= 1) startLayer('kick', beat, () => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(65, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.12);
      osc.connect(gain).connect(dest);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.55, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.start(t); osc.stop(t + 0.18);
    });

    // L2: tambourine shake on offbeat (eighth-note offset)
    if (level >= 2) startLayer('tamb', beat, () => {
      const t = ctx.currentTime + beat / 2;
      const ns = ctx.createBufferSource();
      const ng = ctx.createGain();
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass'; nf.frequency.value = 4200; nf.Q.value = 2.2;
      ns.buffer = this._noise(0.12);
      ns.connect(nf).connect(ng).connect(dest);
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.35, t + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      ns.start(t);
    });

    // L3: brass stab every 2 beats (chord change emphasis)
    if (level >= 3) startLayer('brass', beat * 2, () => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.value = 220;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, t);
      filter.frequency.linearRampToValueAtTime(1800, t + 0.18);
      osc.connect(filter).connect(gain).connect(dest);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.32, t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.start(t); osc.stop(t + 0.38);
    });

    // L4 (one-shot entry): cymbal swell + sustained high choir
    if (level >= 4 && !this._cascadeLayers.choir) {
      const t = ctx.currentTime;
      // Cymbal entry
      const ns = ctx.createBufferSource();
      const ng = ctx.createGain();
      const nf = ctx.createBiquadFilter();
      nf.type = 'highpass'; nf.frequency.value = 5200;
      ns.buffer = this._noise(0.9);
      ns.connect(nf).connect(ng).connect(dest);
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.4, t + 0.008);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      ns.start(t);
      // Sustained choir 880Hz (slow attack so it builds, holds till clear)
      const choir = ctx.createOscillator();
      const cg = ctx.createGain();
      choir.type = 'triangle';
      choir.frequency.value = 880;
      choir.connect(cg).connect(dest);
      cg.gain.setValueAtTime(0, t);
      cg.gain.linearRampToValueAtTime(0.22, t + 1.2);
      choir.start(t);
      this._cascadeLayers.choir = { stop: () => {
        const tt = ctx.currentTime;
        cg.gain.cancelScheduledValues(tt);
        cg.gain.setValueAtTime(cg.gain.value, tt);
        cg.gain.linearRampToValueAtTime(0, tt + 0.6);
        try { choir.stop(tt + 0.7); } catch {}
      }};
    }
  },

  clearCascadeIntensity() {
    if (!this._cascadeLayers) return;
    Object.values(this._cascadeLayers).forEach(layer => { try { layer.stop(); } catch {} });
    this._cascadeLayers = null;
  },

  setMaster(vol) {
    this.masterVol = Math.max(0, Math.min(1, vol));
    if (this.masterGain) this.masterGain.gain.value = this.enabled ? this.masterVol : 0;
    this.save();
  },

  setSfx(vol) {
    this.sfxVol = Math.max(0, Math.min(1, vol));
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVol;
    this.save();
  },

  _env(node, attack, decay, sustain, release, peak, duration) {
    const t = this.ctx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(0, t);
    node.gain.linearRampToValueAtTime(peak, t + attack);
    node.gain.linearRampToValueAtTime(peak * sustain, t + attack + decay);
    node.gain.setValueAtTime(peak * sustain, t + duration - release);
    node.gain.linearRampToValueAtTime(0, t + duration);
  },

  _noise(duration) {
    const sr = this.ctx.sampleRate;
    const len = sr * duration;
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  },

  // ============================================================
  // HYBRID SAMPLE LOADER — Phase B (sample-first, synth-fallback)
  // ============================================================
  // Each event key in sampleManifest maps to an audio file URL.
  // If a file is present, it plays; otherwise synth fallback runs.
  // Drop CC0/CC-BY files into public/assets/audio/ with the names
  // documented in public/assets/audio/README.md.
  samples: {},
  sampleManifest: {
    spinStart:        { url: 'assets/audio/spin_start.wav',        vol: 0.85 },
    reelStop:         { url: 'assets/audio/reel_stop.wav',         vol: 0.85 },
    reelWhoosh:       { url: 'assets/audio/reel_whoosh.wav',       vol: 0.55 },
    scatterLand:      { url: 'assets/audio/scatter_land.wav',      vol: 0.95 },
    winHighlight:     { url: 'assets/audio/win_highlight.mp3',     vol: 0.7  },
    winSmall:         { url: 'assets/audio/win_small.wav',         vol: 0.85 },
    winBig:           { url: 'assets/audio/win_big.wav',           vol: 0.95 },
    winMega:          { url: 'assets/audio/win_mega.mp3',          vol: 0.95 },
    winEpic:          { url: 'assets/audio/win_epic.mp3',          vol: 1.0  },
    winLegendary:     { url: 'assets/audio/win_legendary.mp3',     vol: 1.0  },
    freeSpinTrigger:  { url: 'assets/audio/free_spin_trigger.mp3', vol: 1.0  },
    cascadePop:       { url: 'assets/audio/cascade_pop.wav',       vol: 0.7  },
    anticipation:     { url: 'assets/audio/anticipation.wav',      vol: 0.95 },
    coinTick:         { url: 'assets/audio/coin_tick.wav',         vol: 0.6  },
    buttonClick:      { url: 'assets/audio/button_click.wav',      vol: 0.6  },
    voiceBigWin:      { url: 'assets/audio/voice_big_win.wav',     vol: 1.0  },
    voiceMegaWin:     { url: 'assets/audio/voice_mega_win.wav',    vol: 1.0  },
    voiceEpicWin:     { url: 'assets/audio/voice_epic_win.wav',    vol: 1.0  },
    voiceLegendaryWin:{ url: 'assets/audio/voice_legendary_win.wav', vol: 1.0 },
  },
  _samplesLoaded: false,
  _convolverIR: null, // shared impulse response for reverb

  async loadSamples() {
    if (!this.ctx || this._samplesLoaded) return;
    this._samplesLoaded = true; // mark optimistic to avoid double-load
    const entries = Object.entries(this.sampleManifest);
    await Promise.all(entries.map(async ([key, info]) => {
      try {
        const res = await fetch(info.url);
        if (!res.ok) return; // 404 -> synth fallback
        const buf = await res.arrayBuffer();
        const audio = await this.ctx.decodeAudioData(buf);
        this.samples[key] = audio;
      } catch (_) { /* swallow; synth fallback handles it */ }
    }));
    // Build a short impulse response for the convolution reverb
    this._convolverIR = this._buildImpulseResponse(1.4, 2.2);
  },

  // Try to play a preloaded sample. Returns true on success, false if missing.
  // opts: { vol (0..1), rate (playbackRate), reverb (0..1 wet mix) }
  _playSample(key, opts = {}) {
    if (!this.enabled || !this.ctx) return false;
    const buf = this.samples[key];
    if (!buf) return false;
    const info = this.sampleManifest[key] || {};
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (typeof opts.rate === 'number') src.playbackRate.value = opts.rate;
    const gain = this.ctx.createGain();
    gain.gain.value = (opts.vol != null ? opts.vol : info.vol) || 0.8;
    src.connect(gain);
    // Optional reverb wet send. Use complementary dry/wet gains so the perceived
    // loudness stays equal to a non-reverb sample (previously dry+wet both fed
    // sfxGain at full level, making reverbed sounds ~1.5–2× louder).
    if (opts.reverb && this._convolverIR) {
      const wet = this.ctx.createGain();
      wet.gain.value = opts.reverb;
      const dry = this.ctx.createGain();
      dry.gain.value = 1 - opts.reverb;
      const conv = this.ctx.createConvolver();
      conv.buffer = this._convolverIR;
      gain.connect(conv).connect(wet).connect(this.sfxGain);
      gain.connect(dry).connect(this.sfxGain);
    } else {
      gain.connect(this.sfxGain);
    }
    src.start(t);
    return true;
  },

  // Build a synthetic impulse response (noise-decay) for the convolver.
  // duration = total length in seconds, decay = exponential decay factor (higher = shorter tail)
  _buildImpulseResponse(duration = 1.5, decay = 2.0) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const ir = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        // Noise with exponential decay envelope
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return ir;
  },

  // UI TAP — generic short click for menu/picker/modal buttons (lighter than buttonClick).
  // Pitch can be tweaked via opts.pitch (multiplier 0.5-2.0) for up/down distinction.
  uiTap(pitch = 1.0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 540 * pitch;
    osc.connect(gain).connect(this.sfxGain);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.start(t); osc.stop(t + 0.1);
  },

  // BET CHANGE — pitch shifts up for +, down for - so player hears direction.
  betChange(direction = 1) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = direction > 0 ? 480 : 360;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(direction > 0 ? baseFreq * 1.4 : baseFreq * 0.7, t + 0.08);
    osc.connect(gain).connect(this.sfxGain);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.start(t); osc.stop(t + 0.15);
  },

  // SPIN button click — sharp tactile feedback (called from button handler for instant feel).
  buttonClick() {
    if (!this.enabled || !this.ctx) return;
    // ±4% pitch + ±8% vol variation for organic feel (no two clicks sound identical)
    const rateJitter = 1 + (Math.random() - 0.5) * 0.08;
    const volJitter = 0.85 + (Math.random() - 0.5) * 0.16;
    if (this._playSample('buttonClick', { rate: rateJitter, vol: volJitter })) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.04);
    osc.connect(gain).connect(this.sfxGain);
    this._env(gain, 0.001, 0.015, 0.2, 0.02, 0.5, 0.06);
    osc.start(t); osc.stop(t + 0.08);
  },

  // Spin start — bigger "ka-CHANG" launch sound with maraca crescendo.
  spinStart() {
    if (!this.enabled || !this.ctx) return;
    // Subtle pitch variation so consecutive spins don't sound identical
    const rateJitter = 1 + (Math.random() - 0.5) * 0.06;
    if (this._playSample('spinStart', { rate: rateJitter })) return; // sample wins if available
    const t = this.ctx.currentTime;
    // Brass-like launch sweep (sawtooth descending with lowpass)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.5);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.5);
    osc.connect(filter).connect(gain).connect(this.sfxGain);
    this._env(gain, 0.005, 0.08, 0.6, 0.2, 0.42, 0.55);
    osc.start(t); osc.stop(t + 0.6);

    // Maraca shake with reverb-ish tail
    const ns = this.ctx.createBufferSource();
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 4500;
    nf.Q.value = 2.5;
    ns.buffer = this._noise(0.35);
    ns.connect(nf).connect(ng).connect(this.sfxGain);
    this._env(ng, 0.005, 0.06, 0.35, 0.15, 0.22, 0.35);
    ns.start(t);
  },

  // Reel whoosh LOOP — continuous low rumble during reel scroll, builds tension.
  // Called when reels start scrolling, stopped when all reels have settled.
  // Sample-first: antique slot barrels spinning recording; falls back to synth noise.
  reelWhooshStart() {
    if (!this.enabled || !this.ctx || this._reelWhoosh) return;
    const t = this.ctx.currentTime;

    // Sample-first path — play loaded reel_whoosh sample on loop
    const sampleBuf = this.samples.reelWhoosh;
    if (sampleBuf) {
      const info = this.sampleManifest.reelWhoosh || {};
      const ns = this.ctx.createBufferSource();
      const ng = this.ctx.createGain();
      ns.buffer = sampleBuf;
      ns.loop = true;
      ns.connect(ng).connect(this.sfxGain);
      const targetVol = (info.vol != null ? info.vol : 0.55);
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(targetVol, t + 0.15);
      ns.start(t);
      this._reelWhoosh = { ns, ng };
      return;
    }

    // Synth fallback: noise-based whoosh with bandpass for "wind through reels" feel
    const ns = this.ctx.createBufferSource();
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 600;
    nf.Q.value = 1.2;
    // Long noise buffer (3s) looped
    const sr = this.ctx.sampleRate;
    const len = sr * 3;
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    ns.buffer = buf;
    ns.loop = true;
    ns.connect(nf).connect(ng).connect(this.sfxGain);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.18, t + 0.15);
    ns.start(t);
    this._reelWhoosh = { ns, ng };
  },

  reelWhooshStop() {
    if (!this.ctx || !this._reelWhoosh) return;
    const { ns, ng } = this._reelWhoosh;
    const t = this.ctx.currentTime;
    ng.gain.cancelScheduledValues(t);
    ng.gain.setValueAtTime(ng.gain.value, t);
    ng.gain.linearRampToValueAtTime(0, t + 0.25);
    try { ns.stop(t + 0.3); } catch {}
    this._reelWhoosh = null;
  },

  // Reel STOP — heavier impact thud with bass body + click attack.
  // Each subsequent reel has slightly lower pitch (deeper bass) for cinematic stop sequence.
  reelStop(reelIdx = 0) {
    if (!this.enabled || !this.ctx) return;
    // Sample variant: same buffer but slightly down-pitched per reel for depth
    if (this._playSample('reelStop', { rate: 1 - reelIdx * 0.05 })) return;
    const t = this.ctx.currentTime;
    // CLICK attack (square, very short)
    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(300 - reelIdx * 22, t);
    click.frequency.exponentialRampToValueAtTime(80, t + 0.05);
    click.connect(clickGain).connect(this.sfxGain);
    this._env(clickGain, 0.001, 0.02, 0.2, 0.04, 0.4, 0.08);
    click.start(t); click.stop(t + 0.1);

    // BASS THUD (sine, deep sub for impact)
    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(120 - reelIdx * 10, t);
    thud.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    thud.connect(thudGain).connect(this.sfxGain);
    this._env(thudGain, 0.002, 0.04, 0.25, 0.1, 0.5, 0.18);
    thud.start(t); thud.stop(t + 0.22);
  },

  // SYMBOL land — soft ping when symbol settles (called from spinReel onComplete).
  symbolLand() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 700 + Math.random() * 200;
    osc.connect(gain).connect(this.sfxGain);
    this._env(gain, 0.002, 0.02, 0.1, 0.03, 0.1, 0.06);
    osc.start(t); osc.stop(t + 0.07);
  },

  // SCATTER lands — big bell DONG with shimmer trail.
  scatterLand() {
    if (!this.enabled || !this.ctx) return;
    if (this._playSample('scatterLand', { reverb: 0.3 })) return;
    const t = this.ctx.currentTime;
    // Deep bell DONG (fundamental + 5th + octave)
    [220, 329.63, 440].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain).connect(this.sfxGain);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.32 - i * 0.05, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      osc.start(t); osc.stop(t + 1.3);
    });
    // High shimmer trail (4 notes)
    [880, 1108.73, 1318.51, 1760].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain).connect(this.sfxGain);
      const s = t + 0.1 + i * 0.06;
      gain.gain.setValueAtTime(0, s);
      gain.gain.linearRampToValueAtTime(0.18, s + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, s + 0.7);
      osc.start(s); osc.stop(s + 0.75);
    });
  },

  // ANTICIPATION — heartbeat drumroll, ramping intensity.
  anticipation() {
    if (!this.enabled || !this.ctx) return;
    if (this._playSample('anticipation')) return;
    const t = this.ctx.currentTime;
    // Heartbeat — two low thuds repeated 5x, accelerating
    for (let beat = 0; beat < 5; beat++) {
      const interval = 0.35 - beat * 0.04; // accelerate
      const tBeat = t + beat * interval;
      [0, 0.12].forEach((subOffset, k) => { // double-thud pattern (lub-dub)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, tBeat + subOffset);
        osc.frequency.exponentialRampToValueAtTime(35, tBeat + subOffset + 0.18);
        osc.connect(gain).connect(this.sfxGain);
        gain.gain.setValueAtTime(0, tBeat + subOffset);
        gain.gain.linearRampToValueAtTime(0.45 + beat * 0.06, tBeat + subOffset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, tBeat + subOffset + 0.2);
        osc.start(tBeat + subOffset); osc.stop(tBeat + subOffset + 0.25);
      });
    }
    // Rising sub-bass sweep underneath
    const sweep = this.ctx.createOscillator();
    const sweepGain = this.ctx.createGain();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(60, t);
    sweep.frequency.exponentialRampToValueAtTime(220, t + 1.8);
    sweep.connect(sweepGain).connect(this.sfxGain);
    sweepGain.gain.setValueAtTime(0, t);
    sweepGain.gain.linearRampToValueAtTime(0.12, t + 0.3);
    sweepGain.gain.linearRampToValueAtTime(0.22, t + 1.5);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    sweep.start(t); sweep.stop(t + 2.1);
  },

  // WIN HIGHLIGHT — bright burst/explosion when winning cell glows. Cascade-aware pitch.
  // cascadeIter param raises pitch each cascade for excitement build.
  // Sample-first: blood-pop explosion sample (pitch-shifted per cascade); synth fallback.
  winHighlight(cascadeIter = 0) {
    if (!this.enabled || !this.ctx) return;
    // Sample-first path with cascade-pitched playback rate
    if (this.samples.winHighlight) {
      const rate = 1 + cascadeIter * 0.07; // +7% pitch per cascade iter
      if (this._playSample('winHighlight', { rate })) return;
    }
    const t = this.ctx.currentTime;
    const basePitch = 880 * Math.pow(1.12, cascadeIter); // each cascade +12%
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = basePitch;
    osc.connect(gain).connect(this.sfxGain);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.start(t); osc.stop(t + 0.3);
    // High shimmer overtone
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = basePitch * 1.5;
    osc2.connect(gain2).connect(this.sfxGain);
    gain2.gain.setValueAtTime(0, t);
    gain2.gain.linearRampToValueAtTime(0.12, t + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc2.start(t); osc2.stop(t + 0.25);
  },

  // CASCADE pop — symbol break shatter sound (call per cell removed).
  cascadePop(cascadeIter = 0) {
    if (!this.enabled || !this.ctx) return;
    // Sample variant: pitched up per cascade iteration for excitement,
    // plus ±6% random jitter so consecutive pops at the same iter don't sound identical
    const baseRate = 1 + cascadeIter * 0.08;
    const jitter = baseRate + (Math.random() - 0.5) * 0.12;
    const volJitter = 0.88 + (Math.random() - 0.5) * 0.18;
    if (this._playSample('cascadePop', { rate: jitter, vol: volJitter })) return;
    const t = this.ctx.currentTime;
    // Quick noise burst (shatter)
    const ns = this.ctx.createBufferSource();
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 2500 + cascadeIter * 300; // higher pitch each cascade
    nf.Q.value = 1.5;
    ns.buffer = this._noise(0.08);
    ns.connect(nf).connect(ng).connect(this.sfxGain);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.18, t + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    ns.start(t);
    // Quick pop tone
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600 + cascadeIter * 100, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.06);
    osc.connect(oscGain).connect(this.sfxGain);
    oscGain.gain.setValueAtTime(0, t);
    oscGain.gain.linearRampToValueAtTime(0.15, t + 0.005);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.start(t); osc.stop(t + 0.1);
  },

  // WIN small — quick triumphant arpeggio (NORMAL tier).
  winSmall() {
    if (!this.enabled || !this.ctx) return;
    if (this._playSample('winSmall', { reverb: 0.2 })) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(gain).connect(this.sfxGain);
      const start = t + i * 0.06;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.32, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.start(start); osc.stop(start + 0.4);
    });
  },

  // WIN big — brass swell + choir + cymbal crash (BIG/MEGA tier).
  // `_synthOnly = true` skips the sample lookup; used when called as a fallback
  // from higher tiers (winEpic/winLegendary) where we DO NOT want the big sample
  // to play on top of an already-playing epic/legendary sample.
  winBig(_synthOnly = false) {
    if (!this.enabled || !this.ctx) return;
    if (!_synthOnly && this._playSample('winBig', { reverb: 0.35 })) return;
    const t = this.ctx.currentTime;
    // Brass swell
    const brass = this.ctx.createOscillator();
    const bg = this.ctx.createGain();
    const bf = this.ctx.createBiquadFilter();
    brass.type = 'sawtooth';
    brass.frequency.setValueAtTime(220, t);
    brass.frequency.linearRampToValueAtTime(440, t + 0.5);
    bf.type = 'lowpass';
    bf.frequency.setValueAtTime(900, t);
    bf.frequency.linearRampToValueAtTime(2400, t + 0.5);
    brass.connect(bf).connect(bg).connect(this.sfxGain);
    this._env(bg, 0.03, 0.1, 0.75, 0.4, 0.55, 1.8);
    brass.start(t); brass.stop(t + 1.9);

    // Choir layer
    const choir = this.ctx.createOscillator();
    const cg = this.ctx.createGain();
    choir.type = 'triangle';
    choir.frequency.value = 880;
    choir.connect(cg).connect(this.sfxGain);
    this._env(cg, 0.15, 0.2, 0.85, 0.6, 0.32, 2.2);
    choir.start(t + 0.05); choir.stop(t + 2.3);

    // Cymbal crash (filtered white noise)
    const ns = this.ctx.createBufferSource();
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.value = 4000;
    ns.buffer = this._noise(1.5);
    ns.connect(nf).connect(ng).connect(this.sfxGain);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.3, t + 0.005);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    ns.start(t);
  },

  // WIN mega — sample-first (4s mariachi sting); falls back to winBig synth.
  winMega() {
    if (!this.enabled || !this.ctx) return;
    if (this._playSample('winMega', { reverb: 0.38 })) return;
    this.winBig(true);
  },

  // WIN epic — bigger, dramatic with bass impact (EPIC tier).
  winEpic() {
    if (!this.enabled || !this.ctx) return;
    if (this._playSample('winEpic', { reverb: 0.4 })) return;
    this.winBig(true);  // synth-only — don't double up with bigSample
    const t = this.ctx.currentTime;
    // Deep impact rumble
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60, t);
    sub.frequency.exponentialRampToValueAtTime(40, t + 0.6);
    sub.connect(sg).connect(this.sfxGain);
    sg.gain.setValueAtTime(0, t);
    sg.gain.linearRampToValueAtTime(0.55, t + 0.005);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    sub.start(t); sub.stop(t + 0.9);
  },

  // WIN legendary — orchestral hit + sustained choir + bass + crowd cheer simulated (LEGENDARY tier).
  winLegendary() {
    if (!this.enabled || !this.ctx) return;
    if (this._playSample('winLegendary', { reverb: 0.5 })) return;
    // Inline winEpic's synth path with synth-only big underneath, so we don't
    // accidentally trigger winEpic's sample on top of legendary synth.
    this.winBig(true);
    const _t = this.ctx.currentTime;
    const _sub = this.ctx.createOscillator();
    const _sg = this.ctx.createGain();
    _sub.type = 'sine';
    _sub.frequency.setValueAtTime(60, _t);
    _sub.frequency.exponentialRampToValueAtTime(40, _t + 0.6);
    _sub.connect(_sg).connect(this.sfxGain);
    _sg.gain.setValueAtTime(0, _t);
    _sg.gain.linearRampToValueAtTime(0.55, _t + 0.005);
    _sg.gain.exponentialRampToValueAtTime(0.001, _t + 0.8);
    _sub.start(_t); _sub.stop(_t + 0.9);
    const t = this.ctx.currentTime;
    // Higher choir octave for divine feel
    const high = this.ctx.createOscillator();
    const hg = this.ctx.createGain();
    high.type = 'triangle';
    high.frequency.value = 1760;
    high.connect(hg).connect(this.sfxGain);
    this._env(hg, 0.2, 0.3, 0.9, 0.8, 0.25, 3.0);
    high.start(t + 0.3); high.stop(t + 3.3);

    // Crowd cheer (filtered noise tail)
    const ns = this.ctx.createBufferSource();
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 1500;
    nf.Q.value = 0.8;
    ns.buffer = this._noise(2.5);
    ns.connect(nf).connect(ng).connect(this.sfxGain);
    ng.gain.setValueAtTime(0, t + 0.5);
    ng.gain.linearRampToValueAtTime(0.15, t + 0.8);
    ng.gain.linearRampToValueAtTime(0.1, t + 2.0);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
    ns.start(t + 0.5);
  },

  // COIN tick — pitched coin sound during counter rolling. amount param raises pitch with bigger win.
  coinTick(amount = 0) {
    if (!this.enabled || !this.ctx) return;
    if (this.samples.coinTick) {
      // Pitch scales subtly with amount even for samples
      const pitchBoost = Math.min(0.8, Math.log(1 + amount / 100) * 0.18);
      if (this._playSample('coinTick', { rate: 1 + pitchBoost })) return;
    }
    const t = this.ctx.currentTime;
    // Pitch scales subtly with amount (log scale, capped)
    const pitchBoost = Math.min(800, Math.log(1 + amount / 100) * 200);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1800 + pitchBoost + Math.random() * 200;
    osc.connect(gain).connect(this.sfxGain);
    this._env(gain, 0.001, 0.02, 0.1, 0.02, 0.14, 0.05);
    osc.start(t); osc.stop(t + 0.06);
  },

  // FREE SPIN trigger — epic mariachi fanfare with brass + bell cascade.
  freeSpinTrigger() {
    if (!this.enabled || !this.ctx) return;
    if (this._playSample('freeSpinTrigger', { reverb: 0.4 })) return;
    const t = this.ctx.currentTime;
    // Mariachi-style ascending arpeggio (C major spread over 2 octaves)
    [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((freq, i) => {
      // Triangle for warm tone
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(gain).connect(this.sfxGain);
      const start = t + i * 0.07;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.42, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
      osc.start(start); osc.stop(start + 0.75);
    });
    // Brass swell underneath
    const brass = this.ctx.createOscillator();
    const bg = this.ctx.createGain();
    const bf = this.ctx.createBiquadFilter();
    brass.type = 'sawtooth';
    brass.frequency.setValueAtTime(130.81, t);
    brass.frequency.linearRampToValueAtTime(261.63, t + 0.6);
    bf.type = 'lowpass';
    bf.frequency.setValueAtTime(700, t);
    bf.frequency.linearRampToValueAtTime(1800, t + 0.6);
    brass.connect(bf).connect(bg).connect(this.sfxGain);
    this._env(bg, 0.05, 0.15, 0.7, 0.4, 0.5, 1.6);
    brass.start(t); brass.stop(t + 1.7);
    // Cymbal crash at peak
    const ns = this.ctx.createBufferSource();
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.value = 5000;
    ns.buffer = this._noise(1.0);
    ns.connect(nf).connect(ng).connect(this.sfxGain);
    ng.gain.setValueAtTime(0, t + 0.4);
    ng.gain.linearRampToValueAtTime(0.32, t + 0.42);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    ns.start(t + 0.4);
  },

  // MULTIPLIER bump — coin ding ascending with shimmer.
  // current param raises pitch as ladder climbs (more excitement at higher mults).
  multBump(currentMult = 1) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    // Higher mult = higher base pitch
    const pitchScale = Math.min(2.5, 1 + Math.log(currentMult + 1) * 0.4);
    [880, 1108.73, 1318.51].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * pitchScale;
      osc.connect(gain).connect(this.sfxGain);
      const start = t + i * 0.04;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.33, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.start(start); osc.stop(start + 0.3);
    });
    // Coin shimmer (high random tinkle)
    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = (2400 + Math.random() * 600) * pitchScale;
      osc.connect(gain).connect(this.sfxGain);
      const start = t + 0.15 + i * 0.04;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
      osc.start(start); osc.stop(start + 0.12);
    }
  },

  // Voice announcement per win tier (BIG/MEGA/EPIC/LEGENDARY).
  // Sample-first: if voice_<tier>_win.wav exists, play it.
  // LEGENDARY tier LAYERS applause + epic male YES victory voice for extra drama.
  // Fallback: browser SpeechSynthesis API (instant TTS).
  playVoice(tier) {
    if (!this.enabled || !this.ctx) return;
    const key = 'voice' + tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase() + 'Win';
    let played = this._playSample(key, { reverb: 0.4 });
    // LEGENDARY: also layer males-yes-victory voice ON TOP of applause for cinematic combo
    if (tier === 'LEGENDARY' && played) {
      // Small delay so the male voices punch through over applause swell
      setTimeout(() => this._playSample('voiceEpicWin', { reverb: 0.5, vol: 0.85 }), 200);
    }
    if (played) return;
    // Fallback: browser SpeechSynthesis
    if (!('speechSynthesis' in window)) return;
    try {
      const text = tier.toUpperCase() + ' WIN';
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.85;
      utter.pitch = tier === 'LEGENDARY' ? 0.9 : 1.0;
      utter.volume = this.masterVol * this.sfxVol;
      const voices = window.speechSynthesis.getVoices();
      const deepVoice = voices.find(v => /male|david|google.*male/i.test(v.name));
      if (deepVoice) utter.voice = deepVoice;
      window.speechSynthesis.speak(utter);
    } catch (_) { /* swallow — TTS unavailable */ }
  },

  wildExpand() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1500;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, t);
    osc.frequency.exponentialRampToValueAtTime(1046.5, t + 0.4);
    osc.connect(filter).connect(gain).connect(this.sfxGain);
    this._env(gain, 0.05, 0.1, 0.5, 0.3, 0.4, 0.6);
    osc.start(t); osc.stop(t + 0.7);
  },

  toggle() {
    this.enabled = !this.enabled;
    if (this.masterGain) this.masterGain.gain.value = this.enabled ? this.masterVol : 0;
    this.save();
  },
};
