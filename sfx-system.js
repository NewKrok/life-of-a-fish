// ── SFX System ──────────────────────────────────────────────────────────────
// Procedural chiptune sound effects using Web Audio API.
// All sounds are generated on-the-fly — no external audio files.

export class SfxSystem {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._volume = 0.4;
  }

  // ── Public API ──

  init() {
    if (this._ctx) return;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = this._volume;
    this._masterGain.connect(this._ctx.destination);
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._masterGain) {
      this._masterGain.gain.setTargetAtTime(this._volume, this._ctx.currentTime, 0.05);
    }
  }

  getVolume() { return this._volume; }

  // ── 1. Button click — short blip ──
  buttonClick() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    const osc = this._osc('square', 660, t);
    const g = this._env(osc, t, 0.005, 0.06, 0.35);
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.03);
    osc.frequency.exponentialRampToValueAtTime(780, t + 0.06);
    osc.stop(t + 0.08);
  }

  // ── 2. Game start — ascending fanfare ──
  gameStart() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const start = t + i * 0.1;
      const osc = this._osc('square', freq, start);
      const g = this._env(osc, start, 0.01, 0.15, 0.4);
      // Low-pass for softer square
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 3000;
      g.disconnect();
      g.connect(filt);
      filt.connect(this._masterGain);
      osc.stop(start + 0.18);
    });
  }

  // ── 3. Dash — bubbly underwater boost ──
  dash() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Quick rising bubble tone
    const osc1 = this._osc('sine', 220, t);
    const g1 = this._env(osc1, t, 0.005, 0.12, 0.3);
    osc1.frequency.exponentialRampToValueAtTime(550, t + 0.08);
    osc1.frequency.exponentialRampToValueAtTime(440, t + 0.12);
    osc1.stop(t + 0.14);
    // Second harmonic bubble
    const osc2 = this._osc('sine', 330, t + 0.02);
    const g2 = this._env(osc2, t + 0.02, 0.005, 0.08, 0.15);
    osc2.frequency.exponentialRampToValueAtTime(660, t + 0.06);
    osc2.frequency.exponentialRampToValueAtTime(500, t + 0.1);
    osc2.stop(t + 0.12);
    // Soft filtered noise for water movement
    const noise = this._noise(0.1);
    const nGain = this._ctx.createGain();
    const lpf = this._ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(1200, t);
    lpf.frequency.exponentialRampToValueAtTime(400, t + 0.1);
    noise.connect(lpf);
    lpf.connect(nGain);
    nGain.connect(this._masterGain);
    nGain.gain.setValueAtTime(0.12, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    noise.start(t);
    noise.stop(t + 0.11);
  }

  // ── 4. Splash — water entry/exit ──
  splash() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Initial impact — short loud noise burst (the "slap" of hitting water)
    const impact = this._noise(0.06);
    const impGain = this._ctx.createGain();
    const impLpf = this._ctx.createBiquadFilter();
    impLpf.type = 'lowpass';
    impLpf.frequency.setValueAtTime(3500, t);
    impLpf.frequency.exponentialRampToValueAtTime(800, t + 0.06);
    impact.connect(impLpf);
    impLpf.connect(impGain);
    impGain.connect(this._masterGain);
    impGain.gain.setValueAtTime(0.35, t);
    impGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    impact.start(t);
    impact.stop(t + 0.07);
    // Splash tail — longer filtered noise that fades (water settling)
    const tail = this._noise(0.3);
    const tailGain = this._ctx.createGain();
    const tailBpf = this._ctx.createBiquadFilter();
    tailBpf.type = 'bandpass';
    tailBpf.frequency.setValueAtTime(1500, t + 0.04);
    tailBpf.frequency.exponentialRampToValueAtTime(300, t + 0.3);
    tailBpf.Q.value = 0.8;
    tail.connect(tailBpf);
    tailBpf.connect(tailGain);
    tailGain.connect(this._masterGain);
    tailGain.gain.setValueAtTime(0, t);
    tailGain.gain.linearRampToValueAtTime(0.18, t + 0.04);
    tailGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    tail.start(t);
    tail.stop(t + 0.32);
    // Low thud body (impact resonance)
    const thud = this._osc('sine', 80, t);
    const thudG = this._env(thud, t, 0.005, 0.1, 0.2);
    thud.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    thud.stop(t + 0.12);
    // Bubbles — a few rapid sine pops after the splash
    for (let i = 0; i < 3; i++) {
      const bStart = t + 0.08 + i * 0.04;
      const freq = 400 + Math.random() * 300;
      const bub = this._osc('sine', freq, bStart);
      const bGain = this._env(bub, bStart, 0.003, 0.05, 0.1);
      bub.frequency.exponentialRampToValueAtTime(freq * 0.5, bStart + 0.05);
      bub.stop(bStart + 0.06);
    }
  }

  // ── 5. Crab push — clacky impact ──
  crabPush() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Sharp click
    const osc1 = this._osc('square', 300, t);
    const g1 = this._env(osc1, t, 0.002, 0.04, 0.5);
    osc1.frequency.exponentialRampToValueAtTime(80, t + 0.04);
    osc1.stop(t + 0.05);
    // Noise burst
    const noise = this._noise(0.06);
    const nGain = this._ctx.createGain();
    const hpf = this._ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 2000;
    noise.connect(hpf);
    hpf.connect(nGain);
    nGain.connect(this._masterGain);
    nGain.gain.setValueAtTime(0.2, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    noise.start(t);
    noise.stop(t + 0.07);
  }

  // ── 6. Player death — sad descending tone ──
  playerDeath() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    const notes = [440, 370, 311, 220]; // A4, F#4, D#4, A3 — minor descent
    notes.forEach((freq, i) => {
      const start = t + i * 0.12;
      const osc = this._osc('triangle', freq, start);
      const g = this._env(osc, start, 0.01, 0.18, 0.35);
      osc.stop(start + 0.2);
    });
    // Low thud
    const kick = this._osc('sine', 100, t);
    const kGain = this._env(kick, t, 0.005, 0.3, 0.2);
    kick.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    kick.stop(t + 0.35);
  }

  // ── 7. Pearl pickup — bright sparkle ──
  pearlPickup() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Quick ascending arpeggio
    const notes = [784, 988, 1175, 1568]; // G5, B5, D6, G6
    notes.forEach((freq, i) => {
      const start = t + i * 0.05;
      const osc = this._osc('sine', freq, start);
      const g = this._env(osc, start, 0.005, 0.12, 0.3);
      osc.stop(start + 0.14);
    });
    // Shimmer
    const shimmer = this._osc('sine', 2400, t + 0.15);
    const sGain = this._env(shimmer, t + 0.15, 0.01, 0.2, 0.12);
    shimmer.stop(t + 0.38);
  }

  // ── 8. Stone pickup — heavy thunk ──
  stonePickup() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Low impact
    const osc = this._osc('triangle', 120, t);
    const g = this._env(osc, t, 0.005, 0.12, 0.4);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    osc.stop(t + 0.15);
    // Rattle
    const noise = this._noise(0.08);
    const nGain = this._ctx.createGain();
    const bpf = this._ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 1500;
    bpf.Q.value = 1;
    noise.connect(bpf);
    bpf.connect(nGain);
    nGain.connect(this._masterGain);
    nGain.gain.setValueAtTime(0.15, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    noise.start(t);
    noise.stop(t + 0.09);
  }

  // ── 9. Stone throw — whoosh + thud ──
  stoneThrow() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Whoosh
    const noise = this._noise(0.15);
    const nGain = this._ctx.createGain();
    const bpf = this._ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(1200, t);
    bpf.frequency.exponentialRampToValueAtTime(600, t + 0.15);
    bpf.Q.value = 1.5;
    noise.connect(bpf);
    bpf.connect(nGain);
    nGain.connect(this._masterGain);
    nGain.gain.setValueAtTime(0.25, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.start(t);
    noise.stop(t + 0.16);
    // Low grunt
    const osc = this._osc('sawtooth', 180, t);
    const g = this._env(osc, t, 0.005, 0.1, 0.3);
    const lpf = this._ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 500;
    g.disconnect();
    g.connect(lpf);
    lpf.connect(this._masterGain);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
    osc.stop(t + 0.12);
  }

  // ── 10. Toxic projectile spit ──
  toxicSpit() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Bubbly pop
    const osc = this._osc('sine', 600, t);
    const g = this._env(osc, t, 0.005, 0.08, 0.3);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);
    osc.stop(t + 0.1);
    // Hiss
    const noise = this._noise(0.1);
    const nGain = this._ctx.createGain();
    const hpf = this._ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 3000;
    noise.connect(hpf);
    hpf.connect(nGain);
    nGain.connect(this._masterGain);
    nGain.gain.setValueAtTime(0.12, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    noise.start(t);
    noise.stop(t + 0.11);
  }

  // ── 11. Chest open — wooden creak + metallic click + sparkle ──
  chestOpen() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Wooden creak (low filtered noise sweep)
    const noise1 = this._noise(0.2);
    const n1Gain = this._ctx.createGain();
    const bpf = this._ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(300, t);
    bpf.frequency.exponentialRampToValueAtTime(800, t + 0.15);
    bpf.Q.value = 3;
    noise1.connect(bpf);
    bpf.connect(n1Gain);
    n1Gain.connect(this._masterGain);
    n1Gain.gain.setValueAtTime(0.18, t);
    n1Gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noise1.start(t);
    noise1.stop(t + 0.22);
    // Metallic click/latch
    const click = this._osc('square', 1800, t + 0.05);
    const cGain = this._env(click, t + 0.05, 0.002, 0.04, 0.3);
    click.frequency.exponentialRampToValueAtTime(600, t + 0.09);
    click.stop(t + 0.1);
    // Sparkle reveal (ascending bright tones)
    const notes = [880, 1175, 1480, 1760]; // A5, D6, F#6, A6
    notes.forEach((freq, i) => {
      const start = t + 0.1 + i * 0.06;
      const osc = this._osc('sine', freq, start);
      const g = this._env(osc, start, 0.005, 0.14, 0.2);
      osc.stop(start + 0.16);
    });
    // Shimmer tail
    const shimmer = this._osc('sine', 2600, t + 0.3);
    const sGain = this._env(shimmer, t + 0.3, 0.01, 0.25, 0.1);
    shimmer.stop(t + 0.58);
  }

  // ── 12. Shark chase alert — ominous stinger ──
  sharkAlert() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Two low staccato notes — dun-dun!
    const osc1 = this._osc('sawtooth', 110, t);
    const g1 = this._env(osc1, t, 0.005, 0.15, 0.4);
    const lpf1 = this._ctx.createBiquadFilter();
    lpf1.type = 'lowpass';
    lpf1.frequency.value = 600;
    g1.disconnect();
    g1.connect(lpf1);
    lpf1.connect(this._masterGain);
    osc1.stop(t + 0.17);

    const osc2 = this._osc('sawtooth', 92, t + 0.18);
    const g2 = this._env(osc2, t + 0.18, 0.005, 0.2, 0.45);
    const lpf2 = this._ctx.createBiquadFilter();
    lpf2.type = 'lowpass';
    lpf2.frequency.value = 500;
    g2.disconnect();
    g2.connect(lpf2);
    lpf2.connect(this._masterGain);
    osc2.stop(t + 0.42);
  }

  // ── 13. Crate break — wood crack + splinter scatter ──
  crateBreak() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Wood crack — sharp filtered noise burst
    const crack = this._noise(0.12);
    const crGain = this._ctx.createGain();
    const crBpf = this._ctx.createBiquadFilter();
    crBpf.type = 'bandpass';
    crBpf.frequency.setValueAtTime(1800, t);
    crBpf.frequency.exponentialRampToValueAtTime(600, t + 0.1);
    crBpf.Q.value = 2;
    crack.connect(crBpf);
    crBpf.connect(crGain);
    crGain.connect(this._masterGain);
    crGain.gain.setValueAtTime(0.35, t);
    crGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    crack.start(t);
    crack.stop(t + 0.13);
    // Low thud — wood body resonance
    const thud = this._osc('triangle', 140, t);
    const thudG = this._env(thud, t, 0.003, 0.1, 0.3);
    thud.frequency.exponentialRampToValueAtTime(50, t + 0.1);
    thud.stop(t + 0.12);
    // Splinter scatter — rapid high clicks
    for (let i = 0; i < 4; i++) {
      const start = t + 0.03 + i * 0.025;
      const freq = 1200 + Math.random() * 800;
      const osc = this._osc('square', freq, start);
      const g = this._env(osc, start, 0.002, 0.03, 0.15);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, start + 0.03);
      osc.stop(start + 0.04);
    }
  }

  // ── 12. Enemy death — pop + sparkle ──
  enemyDeath() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Pop
    const osc1 = this._osc('square', 500, t);
    const g1 = this._env(osc1, t, 0.003, 0.06, 0.35);
    osc1.frequency.exponentialRampToValueAtTime(1200, t + 0.03);
    osc1.frequency.exponentialRampToValueAtTime(300, t + 0.06);
    osc1.stop(t + 0.08);
    // Sparkle
    const osc2 = this._osc('sine', 1500, t + 0.05);
    const g2 = this._env(osc2, t + 0.05, 0.005, 0.15, 0.2);
    osc2.frequency.exponentialRampToValueAtTime(2500, t + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(1800, t + 0.2);
    osc2.stop(t + 0.22);
    // Noise burst
    const noise = this._noise(0.06);
    const nGain = this._ctx.createGain();
    noise.connect(nGain);
    nGain.connect(this._masterGain);
    nGain.gain.setValueAtTime(0.1, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    noise.start(t);
    noise.stop(t + 0.07);
  }

  // ── 13. Stun Pulse — electric zap burst ──
  stunPulse() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Rising electric tone
    const osc1 = this._osc('sawtooth', 200, t);
    const g1 = this._env(osc1, t, 0.005, 0.2, 0.3);
    osc1.frequency.exponentialRampToValueAtTime(800, t + 0.08);
    osc1.frequency.exponentialRampToValueAtTime(400, t + 0.2);
    osc1.stop(t + 0.22);
    // High sparkle
    const osc2 = this._osc('sine', 1200, t + 0.02);
    const g2 = this._env(osc2, t + 0.02, 0.003, 0.15, 0.25);
    osc2.frequency.exponentialRampToValueAtTime(2400, t + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(600, t + 0.17);
    osc2.stop(t + 0.19);
    // Filtered noise burst for impact
    const noise = this._noise(0.12);
    const nGain = this._ctx.createGain();
    const filt = this._ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1500;
    filt.Q.value = 3;
    noise.connect(filt);
    filt.connect(nGain);
    nGain.connect(this._masterGain);
    nGain.gain.setValueAtTime(0.15, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    noise.start(t);
    noise.stop(t + 0.13);
  }

  // ── 14. Speed Surge — whoosh + rising power-up ──
  speedSurge() {
    if (!this._ensureCtx()) return;
    const t = this._ctx.currentTime;
    // Rising whoosh
    const osc1 = this._osc('sine', 180, t);
    const g1 = this._env(osc1, t, 0.01, 0.25, 0.25);
    osc1.frequency.exponentialRampToValueAtTime(600, t + 0.15);
    osc1.frequency.exponentialRampToValueAtTime(350, t + 0.25);
    osc1.stop(t + 0.27);
    // Bright shimmer
    const osc2 = this._osc('triangle', 800, t + 0.05);
    const g2 = this._env(osc2, t + 0.05, 0.005, 0.2, 0.2);
    osc2.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(1000, t + 0.25);
    osc2.stop(t + 0.27);
    // Filtered noise for wind
    const noise = this._noise(0.15);
    const nGain = this._ctx.createGain();
    const filt = this._ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 2000;
    noise.connect(filt);
    filt.connect(nGain);
    nGain.connect(this._masterGain);
    nGain.gain.setValueAtTime(0.1, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.start(t);
    noise.stop(t + 0.16);
  }

  // ── Helpers ──

  _ensureCtx() {
    if (!this._ctx) this.init();
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return true;
  }

  /** Create and connect an oscillator */
  _osc(type, freq, startTime) {
    const osc = this._ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    osc.start(startTime);
    return osc;
  }

  /** Create an envelope gain node, connect osc→gain→master, return gain */
  _env(osc, startTime, attack, duration, peak) {
    const g = this._ctx.createGain();
    osc.connect(g);
    g.connect(this._masterGain);
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(peak, startTime + attack);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    return g;
  }

  /** Create a white noise buffer source */
  _noise(duration) {
    const sampleCount = this._ctx.sampleRate * duration;
    const buffer = this._ctx.createBuffer(1, sampleCount, this._ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;
    const source = this._ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }
}
