// Cayo Lumen sound: everything is synthesized with WebAudio — no audio files.
// Engine hum, sirens, gunshots, crashes and pickups are oscillators and
// filtered noise; the three radio stations are procedural step sequencers
// with a lookahead scheduler, so the music never repeats the same bar twice
// in a row without the player noticing the loop.

const NOTE = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
  E5b: 622.25, B4b: 466.16, A4b: 415.3, G4b: 415.3, D5b: 554.37,
};

// Each station: a chord pad line, a lead/bass line and a 16-step groove.
// steps are scale degrees into `scale`; -1 means rest.
const STATIONS = [
  {
    // SOL MAR FM — synthwave arpeggio over a minor pad
    name: 'SOL MAR FM',
    bpm: 112,
    scale: [NOTE.A2, NOTE.C3, NOTE.E3, NOTE.G3, NOTE.A3, NOTE.C4, NOTE.E4, NOTE.G4],
    pad: [0, -1, 4, -1, 5, -1, 4, -1],
    lead: [7, 5, 6, 4, 5, 7, 4, 2, 3, 5, 4, 6, 5, 3, 2, 4],
    bass: [0, -1, -1, 0, -1, -1, 0, -1, 3, -1, -1, 3, -1, -1, 5, -1],
    leadWave: 'square',
    leadGain: 0.05,
  },
  {
    // LUMEN 88 — slow chill chords, soft triangle lead
    name: 'LUMEN 88',
    bpm: 76,
    scale: [NOTE.C3, NOTE.E3, NOTE.G3, NOTE.B3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.B4],
    pad: [0, -1, -1, -1, 3, -1, -1, -1, 4, -1, -1, -1, 2, -1, -1, -1],
    lead: [4, -1, 6, -1, 7, -1, 6, -1, 5, -1, 4, -1, 2, -1, 3, -1],
    bass: [0, -1, -1, -1, -1, -1, -1, -1, 4, -1, -1, -1, -1, -1, -1, -1],
    leadWave: 'triangle',
    leadGain: 0.07,
  },
  {
    // BASSLINE 101 — driving bass, sparse stabs
    name: 'BASSLINE 101',
    bpm: 126,
    scale: [NOTE.E2, NOTE.G2, NOTE.A2, NOTE.B2, NOTE.D3, NOTE.E3, NOTE.G3, NOTE.A3],
    pad: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    lead: [-1, -1, 7, -1, -1, 5, -1, -1, -1, -1, 7, -1, 6, -1, 5, -1],
    bass: [0, 0, -1, 0, -1, 0, 2, -1, 0, 0, -1, 0, 4, -1, 3, -1],
    leadWave: 'sawtooth',
    leadGain: 0.04,
  },
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.station = 0;
    this.radioOn = true;
    this._engine = null; // { osc, osc2, gain, filter }
    this._siren = null; // { osc, gain, lfo }
    this._seqTimer = null;
    this._nextNoteTime = 0;
    this._step = 0;
    this._noiseBuffer = null;
    this._started = false;
  }

  /** Create the context. Must run from a user gesture (click / key) the first time. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this._noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this._noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    this._startEngineLoop();
    this._startSequencer();
    this._started = true;
  }

  get started() {
    return this._started;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.8;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setRadioStation(i) {
    this.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
    this._step = 0;
    return STATIONS[this.station].name;
  }

  cycleRadio() {
    return this.setRadioStation(this.station + 1);
  }

  currentStationName() {
    return STATIONS[this.station].name;
  }

  /** The HUD reads this property for the radio line. */
  get stationName() {
    return STATIONS[this.station].name;
  }

  // ---- continuous loops ----

  _startEngineLoop() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 27.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc2.start();
    this._engine = { osc, osc2, gain, filter };
  }

  _startSiren() {
    if (this._siren || !this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 750;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    lfo.start();
    this._siren = { osc, lfo, gain };
  }

  _stopSiren() {
    if (!this._siren) return;
    try {
      this._siren.osc.stop();
      this._siren.lfo.stop();
    } catch {
      // Already stopped.
    }
    this._siren = null;
  }

  // ---- radio sequencer (lookahead scheduler) ----

  _startSequencer() {
    this._nextNoteTime = this.ctx.currentTime + 0.1;
    this._step = 0;
    this._seqTimer = window.setInterval(() => this._scheduleAhead(), 40);
  }

  _scheduleAhead() {
    if (!this.ctx || !this.radioOn) return;
    const station = STATIONS[this.station];
    const stepDur = 60 / station.bpm / 4; // 16th notes
    while (this._nextNoteTime < this.ctx.currentTime + 0.15) {
      this._playStep(station, this._step, this._nextNoteTime, stepDur);
      this._step = (this._step + 1) % 16;
      this._nextNoteTime += stepDur;
    }
  }

  _playStep(station, step, when, stepDur) {
    const padDeg = station.pad[step];
    if (padDeg >= 0) {
      // Soft pad chord: root + third + fifth, long release.
      const root = station.scale[padDeg];
      this._tone(root, when, stepDur * 7, 'sine', 0.045, 900);
      this._tone(root * 1.25, when, stepDur * 7, 'sine', 0.03, 900);
      this._tone(root * 1.5, when, stepDur * 7, 'sine', 0.03, 900);
    }
    const leadDeg = station.lead[step];
    if (leadDeg >= 0) {
      this._tone(station.scale[leadDeg] * 2, when, stepDur * 1.8, station.leadWave, station.leadGain, 2400);
    }
    const bassDeg = station.bass[step];
    if (bassDeg >= 0) {
      this._tone(station.scale[bassDeg], when, stepDur * 1.6, 'triangle', 0.11, 500);
    }
    if (step % 4 === 2) this._hat(when, 0.015); // off-beat hat tick
  }

  _tone(freq, when, dur, type, gainVal, cutoff) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(gainVal, when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  _hat(when, gainVal) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    src.start(when, Math.random() * 0.5);
    src.stop(when + 0.06);
  }

  // ---- one-shot effects ----

  _burst(when, dur, type, freq, gainVal, slideTo) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  _noise(when, dur, gainVal, filterType, freq) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(when, Math.random() * 0.5);
    src.stop(when + dur + 0.02);
  }

  /** Play a named effect. Safe to call before ensure() — it just does nothing. */
  play(name) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    switch (name) {
      case 'shot':
        this._noise(now, 0.14, 0.5, 'highpass', 900);
        this._burst(now, 0.1, 'square', 220, 0.25, 60);
        break;
      case 'punch':
        this._noise(now, 0.09, 0.35, 'lowpass', 500);
        this._burst(now, 0.08, 'sine', 140, 0.3, 70);
        break;
      case 'crash':
        this._noise(now, 0.4, 0.6, 'lowpass', 800);
        this._burst(now, 0.3, 'sawtooth', 110, 0.3, 40);
        break;
      case 'pickup':
        this._burst(now, 0.09, 'sine', 880, 0.2);
        this._burst(now + 0.09, 0.14, 'sine', 1318, 0.2);
        break;
      case 'success':
        this._burst(now, 0.12, 'triangle', 523, 0.22);
        this._burst(now + 0.12, 0.12, 'triangle', 659, 0.22);
        this._burst(now + 0.24, 0.24, 'triangle', 784, 0.22);
        break;
      case 'fail':
        this._burst(now, 0.22, 'sawtooth', 220, 0.18, 160);
        this._burst(now + 0.2, 0.3, 'sawtooth', 165, 0.18, 110);
        break;
      case 'click':
        this._burst(now, 0.05, 'square', 1200, 0.12);
        break;
      case 'siren-on':
        this._startSiren();
        break;
      case 'siren-off':
        this._stopSiren();
        break;
      case 'horn':
        this._burst(now, 0.25, 'square', 370, 0.16);
        this._burst(now, 0.25, 'square', 466, 0.12);
        break;
      default:
        break;
    }
  }

  /**
   * Per-frame: engine pitch follows speed, siren fades with the wanted level.
   * @param {number} dt seconds
   * @param {number} speed m/s of the player's vehicle (0 on foot)
   * @param {number} wanted 0..5
   * @param {boolean} inCar
   */
  update(dt, speed, wanted, inCar) {
    if (!this.ctx) return;
    if (this._engine) {
      const target = inCar ? 0.045 + Math.min(speed / 50, 1) * 0.075 : 0;
      const g = this._engine.gain.gain;
      g.value += (target - g.value) * Math.min(1, dt * 6);
      const rpm = 55 + Math.min(speed / 50, 1) * 130;
      this._engine.osc.frequency.value = rpm;
      this._engine.osc2.frequency.value = rpm * 0.5;
      this._engine.filter.frequency.value = 300 + Math.min(speed / 50, 1) * 900;
    }
    if (wanted > 0) {
      this._startSiren();
      if (this._siren) {
        const target = 0.028 + wanted * 0.008;
        const g = this._siren.gain.gain;
        g.value += (target - g.value) * Math.min(1, dt * 3);
      }
    } else if (this._siren) {
      const g = this._siren.gain.gain;
      g.value += (0 - g.value) * Math.min(1, dt * 3);
      if (g.value < 0.001) this._stopSiren();
    }
  }
}

