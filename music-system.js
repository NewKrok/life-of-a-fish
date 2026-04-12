// ── Procedural Music System ─────────────────────────────────────────────────
// Generates voxel-style chiptune music using Web Audio API.
// Two modes: mellow menu theme and upbeat game theme.

// ── Note frequencies (Hz) ──
const NOTES = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50,
};

// ── Scales & Patterns ──

// Menu: dreamy pentatonic in C major — slow, peaceful, underwater feel
const MENU_SCALE = ['C4', 'E4', 'G4', 'A4', 'C5', 'E5', 'G5'];
const MENU_BASS_NOTES = ['C3', 'G3', 'A3', 'F3', 'C3', 'E3', 'G3', 'A3'];
const MENU_BPM = 72;                  // beats per minute — slow & dreamy

// Menu melody patterns (scale indices, -1 = rest)
const MENU_MELODY_PATTERNS = [
  [0, -1, 2, -1, 4, -1, 3, -1, 2, -1, 1, -1, 0, -1, -1, -1],
  [2, -1, 4, -1, 5, -1, 4, -1, 3, -1, 2, -1, 1, -1, 0, -1],
  [4, -1, 5, -1, 6, -1, 5, -1, 4, -1, 3, -1, 2, -1, -1, -1],
  [3, -1, 2, -1, 1, -1, 0, -1, 2, -1, 4, -1, 3, -1, -1, -1],
];

// Menu arpeggio patterns (scale indices)
const MENU_ARP_PATTERNS = [
  [0, 2, 4, 2],
  [1, 3, 5, 3],
  [2, 4, 6, 4],
  [0, 3, 5, 3],
];

// Game: upbeat major pentatonic — energetic, adventurous
const GAME_SCALE = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5'];
const GAME_BASS_NOTES = ['C3', 'G3', 'C3', 'E3', 'F3', 'G3', 'A3', 'G3'];
const GAME_BPM = 120;                 // beats per minute — upbeat & lively

// Game melody patterns (scale indices, -1 = rest)
const GAME_MELODY_PATTERNS = [
  [0, 2, 4, 5, 4, 2, 3, 1, 0, -1, 2, 4, 5, 6, 7, -1],
  [5, 4, 3, 2, 4, 5, 6, 7, 5, 4, 3, 2, 1, 0, -1, -1],
  [0, -1, 3, 5, 7, 5, 4, -1, 2, 4, 5, 3, 2, 1, 0, -1],
  [7, 6, 5, 4, 3, 2, 1, 0, 2, 4, 6, 7, 5, 3, 1, -1],
];

// Game arpeggio patterns (scale indices)
const GAME_ARP_PATTERNS = [
  [0, 2, 4, 5, 4, 2],
  [1, 3, 5, 6, 5, 3],
  [2, 4, 6, 7, 6, 4],
  [0, 3, 5, 7, 5, 3],
];

// ── Percussion patterns (1 = hit, 0 = silent) ──
const MENU_KICK_PATTERN =  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
const MENU_HIHAT_PATTERN = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];

const GAME_KICK_PATTERN =  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const GAME_SNARE_PATTERN = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const GAME_HIHAT_PATTERN = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];

// ── Cross-fade duration ──
const FADE_DURATION = 1.5;            // seconds

export class MusicSystem {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._volume = 0.5;
    this._mode = null;                 // 'menu' | 'game'
    this._playing = false;
    this._schedulerTimer = null;

    // Scheduling state
    this._nextNoteTime = 0;
    this._currentStep = 0;
    this._melodyPattern = 0;
    this._arpPattern = 0;
    this._barCount = 0;

    // Gain nodes per voice for cross-fading
    this._melodyGain = null;
    this._arpGain = null;
    this._bassGain = null;
    this._percGain = null;

    // Lookahead scheduling constants
    this._scheduleAhead = 0.15;       // seconds — how far ahead to schedule
    this._lookInterval = 80;          // ms — scheduler tick interval
  }

  // ── Public API ──

  /** Ensure AudioContext is created (must be called from user gesture) */
  init() {
    if (this._ctx) return;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master gain
    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = this._volume;
    this._masterGain.connect(this._ctx.destination);

    // Voice gain nodes
    this._melodyGain = this._createGain(0.22);
    this._arpGain = this._createGain(0.13);
    this._bassGain = this._createGain(0.2);
    this._percGain = this._createGain(0.15);
  }

  /** Start playing in given mode */
  play(mode) {
    this.init();
    if (this._ctx.state === 'suspended') this._ctx.resume();

    if (this._mode === mode && this._playing) return;

    const wasPlaying = this._playing;
    this._mode = mode;

    // Reset step counter for clean transition
    this._currentStep = 0;
    this._barCount = 0;
    this._melodyPattern = 0;
    this._arpPattern = 0;

    if (wasPlaying) {
      // Cross-fade: quickly fade out then ramp up
      this._fadeAllVoices(0, 0.3);
      setTimeout(() => this._fadeAllVoices(1, FADE_DURATION), 300);
    } else {
      // Fresh start — fade in
      this._setAllVoicesGain(0);
      this._fadeAllVoices(1, FADE_DURATION);
    }

    if (!this._playing) {
      this._playing = true;
      this._nextNoteTime = this._ctx.currentTime + 0.1;
      this._startScheduler();
    }
  }

  /** Stop all music */
  stop() {
    if (!this._playing) return;
    this._playing = false;
    this._stopScheduler();
    this._fadeAllVoices(0, 0.5);
  }

  /** Set volume 0–1 */
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._masterGain) {
      this._masterGain.gain.setTargetAtTime(this._volume, this._ctx.currentTime, 0.05);
    }
  }

  getVolume() { return this._volume; }

  // ── Scheduler ──

  _startScheduler() {
    this._stopScheduler();
    this._schedulerTimer = setInterval(() => this._schedule(), this._lookInterval);
  }

  _stopScheduler() {
    if (this._schedulerTimer !== null) {
      clearInterval(this._schedulerTimer);
      this._schedulerTimer = null;
    }
  }

  _schedule() {
    if (!this._playing || !this._ctx) return;
    const isMenu = this._mode === 'menu';
    const bpm = isMenu ? MENU_BPM : GAME_BPM;
    const stepDuration = 60 / bpm / 4;  // sixteenth notes

    while (this._nextNoteTime < this._ctx.currentTime + this._scheduleAhead) {
      this._playStep(this._nextNoteTime, this._currentStep, isMenu, stepDuration);
      this._nextNoteTime += stepDuration;
      this._currentStep++;

      // Every 16 steps = 1 bar
      if (this._currentStep % 16 === 0) {
        this._barCount++;
        // Rotate patterns every 2 bars
        if (this._barCount % 2 === 0) {
          const melodyPatterns = isMenu ? MENU_MELODY_PATTERNS : GAME_MELODY_PATTERNS;
          const arpPatterns = isMenu ? MENU_ARP_PATTERNS : GAME_ARP_PATTERNS;
          this._melodyPattern = (this._melodyPattern + 1) % melodyPatterns.length;
          this._arpPattern = (this._arpPattern + 1) % arpPatterns.length;
        }
      }
    }
  }

  _playStep(time, step, isMenu, stepDuration) {
    const step16 = step % 16;
    const scale = isMenu ? MENU_SCALE : GAME_SCALE;
    const melodyPatterns = isMenu ? MENU_MELODY_PATTERNS : GAME_MELODY_PATTERNS;
    const arpPatterns = isMenu ? MENU_ARP_PATTERNS : GAME_ARP_PATTERNS;
    const bassNotes = isMenu ? MENU_BASS_NOTES : GAME_BASS_NOTES;

    // ── Melody (every 2 sixteenths for menu, every sixteenth for game) ──
    if (isMenu ? (step16 % 2 === 0) : true) {
      const pattern = melodyPatterns[this._melodyPattern];
      const noteIdx = pattern[step16];
      if (noteIdx >= 0 && noteIdx < scale.length) {
        const freq = NOTES[scale[noteIdx]];
        const dur = isMenu ? stepDuration * 3 : stepDuration * 1.5;
        this._playMelodyNote(freq, time, dur, isMenu);
      }
    }

    // ── Arpeggio (every 2 sixteenths for menu, every sixteenth for game) ──
    const arpPattern = arpPatterns[this._arpPattern];
    const arpLen = arpPattern.length;
    if (isMenu ? (step16 % 4 === 0) : (step16 % 2 === 0)) {
      const arpStep = isMenu ? (step16 / 4) % arpLen : (step16 / 2) % arpLen;
      const arpIdx = arpPattern[Math.floor(arpStep)];
      if (arpIdx >= 0 && arpIdx < scale.length) {
        const freq = NOTES[scale[arpIdx]];
        const dur = isMenu ? stepDuration * 4 : stepDuration * 2;
        this._playArpNote(freq, time, dur, isMenu);
      }
    }

    // ── Bass (every 8 sixteenths = every 2 beats) ──
    if (step16 % 8 === 0) {
      const bassIdx = Math.floor((step % 128) / 16) % bassNotes.length;
      const freq = NOTES[bassNotes[bassIdx]];
      const dur = isMenu ? stepDuration * 8 : stepDuration * 6;
      this._playBassNote(freq, time, dur, isMenu);
    }

    // ── Percussion ──
    this._playPercStep(step16, time, isMenu, stepDuration);
  }

  // ── Voice synthesis ──

  _playMelodyNote(freq, time, duration, isMenu) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Menu: soft triangle, Game: slightly brighter square with low pass
    osc.type = isMenu ? 'triangle' : 'square';
    osc.frequency.value = freq;

    // Subtle vibrato for warmth
    const vibrato = ctx.createOscillator();
    const vibratoGain = ctx.createGain();
    vibrato.type = 'sine';
    vibrato.frequency.value = isMenu ? 4 : 5.5;
    vibratoGain.gain.value = isMenu ? 1.5 : 2;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);

    osc.connect(gain);

    if (!isMenu) {
      // Low-pass filter for softer square wave
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;
      filter.Q.value = 1;
      gain.connect(filter);
      filter.connect(this._melodyGain);
    } else {
      gain.connect(this._melodyGain);
    }

    // Envelope: gentle attack, sustain, release
    const attack = isMenu ? 0.08 : 0.02;
    const release = isMenu ? 0.3 : 0.15;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(isMenu ? 0.7 : 0.6, time + attack);
    gain.gain.setValueAtTime(isMenu ? 0.7 : 0.6, time + duration - release);
    gain.gain.linearRampToValueAtTime(0, time + duration);

    osc.start(time);
    osc.stop(time + duration + 0.01);
    vibrato.start(time);
    vibrato.stop(time + duration + 0.01);
  }

  _playArpNote(freq, time, duration, isMenu) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Delicate sine/triangle arpeggios
    osc.type = isMenu ? 'sine' : 'triangle';
    osc.frequency.value = freq;

    osc.connect(gain);
    gain.connect(this._arpGain);

    const attack = 0.01;
    const release = isMenu ? 0.4 : 0.2;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(isMenu ? 0.5 : 0.45, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  _playBassNote(freq, time, duration, isMenu) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Warm triangle bass
    osc.type = 'triangle';
    osc.frequency.value = freq;

    // Sub-octave for depth
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    subGain.gain.value = 0.3;
    sub.connect(subGain);
    subGain.connect(this._bassGain);

    osc.connect(gain);
    gain.connect(this._bassGain);

    const attack = 0.02;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(isMenu ? 0.6 : 0.7, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.start(time);
    osc.stop(time + duration + 0.01);
    sub.start(time);
    sub.stop(time + duration + 0.01);
  }

  _playPercStep(step16, time, isMenu, stepDuration) {
    const ctx = this._ctx;

    if (isMenu) {
      // Soft kick
      if (MENU_KICK_PATTERN[step16]) this._playKick(time, 0.15);
      // Gentle hi-hat
      if (MENU_HIHAT_PATTERN[step16]) this._playHiHat(time, 0.06);
    } else {
      // Punchy kick
      if (GAME_KICK_PATTERN[step16]) this._playKick(time, 0.3);
      // Snare
      if (GAME_SNARE_PATTERN[step16]) this._playSnare(time, 0.2);
      // Hi-hat
      if (GAME_HIHAT_PATTERN[step16]) this._playHiHat(time, 0.1);
    }
  }

  _playKick(time, volume) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
    osc.connect(gain);
    gain.connect(this._percGain);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  _playSnare(time, volume) {
    const ctx = this._ctx;
    // Noise burst
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    // Bandpass for snare character
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this._percGain);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    noise.start(time);
    noise.stop(time + 0.09);

    // Tonal body
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 180;
    osc.connect(oscGain);
    oscGain.connect(this._percGain);
    oscGain.gain.setValueAtTime(volume * 0.4, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  _playHiHat(time, volume) {
    const ctx = this._ctx;
    const bufferSize = ctx.sampleRate * 0.04;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;
    const gain = ctx.createGain();
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this._percGain);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noise.start(time);
    noise.stop(time + 0.05);
  }

  // ── Helpers ──

  _createGain(value) {
    const g = this._ctx.createGain();
    g.gain.value = value;
    g.connect(this._masterGain);
    return g;
  }

  _fadeAllVoices(target, duration) {
    const now = this._ctx.currentTime;
    const gains = [this._melodyGain, this._arpGain, this._bassGain, this._percGain];
    const defaults = [0.22, 0.13, 0.2, 0.15];
    for (let i = 0; i < gains.length; i++) {
      const g = gains[i];
      const targetVal = target === 0 ? 0.001 : defaults[i];
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      if (target === 0) {
        g.gain.exponentialRampToValueAtTime(0.001, now + duration);
      } else {
        g.gain.linearRampToValueAtTime(targetVal, now + duration);
      }
    }
  }

  _setAllVoicesGain(value) {
    const v = Math.max(0.001, value);
    [this._melodyGain, this._arpGain, this._bassGain, this._percGain].forEach(g => {
      g.gain.setValueAtTime(v, this._ctx.currentTime);
    });
  }
}
