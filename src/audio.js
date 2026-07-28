/**
 * Everything is synthesised — no asset files. The hall hum is two detuned
 * saws through a lowpass, which reads convincingly as "lots of fans".
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambience = null;
  }

  _ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  resume() {
    this._ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  startAmbience() {
    const ctx = this._ensure();
    if (this.ambience) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 2);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.Q.value = 0.6;

    const oscs = [58, 87, 116].map((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'triangle' : 'sawtooth';
      osc.frequency.value = freq + Math.random() * 2;
      osc.connect(filter);
      osc.start();
      return osc;
    });

    // airflow: filtered white noise
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 0.4;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.35;
    noise.connect(noiseFilter).connect(noiseGain).connect(gain);
    noise.start();

    filter.connect(gain);
    gain.connect(this.master);
    this.ambience = { gain, oscs, noise };
  }

  stopAmbience() {
    if (!this.ambience) return;
    const { gain, oscs, noise } = this.ambience;
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.2);
    setTimeout(() => {
      oscs.forEach((o) => o.stop());
      noise.stop();
    }, 1400);
    this.ambience = null;
  }

  /** Stereo placement, -1 hard left to 1 hard right. */
  _pan(value) {
    const ctx = this._ensure();
    if (!ctx.createStereoPanner) return this.master;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, value));
    panner.connect(this.master);
    return panner;
  }

  _tone(freq, duration, type = 'square', volume = 0.15, delay = 0, pan = 0) {
    const ctx = this._ensure();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(pan ? this._pan(pan) : this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /** Filtered noise burst — the raw material for most of the night sounds. */
  _noise({ duration = 0.4, type = 'bandpass', freq = 900, q = 1, volume = 0.2, pan = 0, sweepTo = null, delay = 0 } = {}) {
    const ctx = this._ensure();
    const t = ctx.currentTime + delay;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + duration * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(pan ? this._pan(pan) : this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  blip() { this._tone(880, 0.07, 'square', 0.08); }

  success() {
    this._tone(660, 0.09, 'square', 0.09);
    this._tone(990, 0.14, 'square', 0.08, 0.09);
  }

  pager(critical) {
    for (let i = 0; i < (critical ? 3 : 2); i++) {
      this._tone(critical ? 1180 : 760, 0.1, 'square', 0.11, i * 0.16);
    }
  }

  alarm() {
    for (let i = 0; i < 4; i++) {
      this._tone(440, 0.18, 'sawtooth', 0.1, i * 0.22);
      this._tone(330, 0.18, 'sawtooth', 0.08, i * 0.22 + 0.09);
    }
  }

  footstep(sprinting, pan = 0, volume = 1) {
    const ctx = this._ensure();
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.08), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = sprinting ? 1500 : 1100;
    const gain = ctx.createGain();
    gain.gain.value = (sprinting ? 0.16 : 0.1) * volume;
    src.connect(filter).connect(gain).connect(pan ? this._pan(pan) : this.master);
    src.start(t);
  }

  // ---- night shift ---------------------------------------------------------

  /** How much of the hall is still turning. 1 is a full fan wall, 0 is silence. */
  setHum(level) {
    if (!this.ambience) return;
    const target = 0.02 + Math.max(0, Math.min(1, level)) * 0.11;
    const t = this._ensure().currentTime;
    this.ambience.gain.gain.cancelScheduledValues(t);
    this.ambience.gain.gain.linearRampToValueAtTime(target, t + 2.5);
  }

  /** Something metal, somewhere else. */
  clang(pan = 0) {
    this._tone(196 + Math.random() * 40, 0.5, 'triangle', 0.1, 0, pan);
    this._tone(392 + Math.random() * 60, 0.32, 'square', 0.05, 0.01, pan);
    this._noise({ duration: 0.5, freq: 2400, q: 0.7, volume: 0.09, pan, sweepTo: 500 });
  }

  /** Distant door, heavy and closing. */
  doorSlam(pan = 0) {
    this._tone(70, 0.55, 'sine', 0.16, 0, pan);
    this._noise({ duration: 0.3, type: 'lowpass', freq: 500, volume: 0.14, pan });
  }

  /** The floor tile creak nobody stepped on. */
  creak(pan = 0) {
    this._noise({ duration: 0.9, freq: 320, q: 6, volume: 0.07, pan, sweepTo: 900 });
  }

  /** Air moving where it should not be. */
  whisper(pan = 0) {
    this._noise({ duration: 1.6, freq: 1500, q: 0.5, volume: 0.05, pan, sweepTo: 400 });
  }

  /** Radio keying up. */
  radioStatic(duration = 0.7) {
    this._noise({ duration, type: 'highpass', freq: 1800, volume: 0.08 });
    this._tone(1400, 0.05, 'square', 0.04);
  }

  /** The floor dropping out from under a moment. */
  stinger() {
    const ctx = this._ensure();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 1.4);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.17, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 1.55);
  }

  /** A fluorescent tube striking, or trying to. */
  ballastBuzz(pan = 0) {
    for (let i = 0; i < 5; i++) {
      this._noise({ duration: 0.05, freq: 3200, q: 2, volume: 0.06, pan, delay: i * 0.09 });
      this._tone(120, 0.05, 'square', 0.05, i * 0.09, pan);
    }
  }
}
