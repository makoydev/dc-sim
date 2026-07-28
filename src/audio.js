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

  /**
   * It is here. Sub drop, a metal shriek dragged down, and a cluster of
   * dissonant partials that do not belong in a room full of fans.
   */
  arrival() {
    const ctx = this._ensure();
    const t = ctx.currentTime;

    for (const [freq, detune] of [[52, 0], [52, 11], [78, -7]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * 3, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 2.2);
      osc.detune.value = detune;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.13, t + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 3);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2600, t);
      filter.frequency.exponentialRampToValueAtTime(220, t + 3);
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 3.1);
    }
    this._noise({ duration: 2.6, type: 'bandpass', freq: 3200, q: 3, volume: 0.1, sweepTo: 260 });
    this._tone(41, 3, 'sine', 0.2);
  }

  /**
   * A sustained layer that lives for as long as it is hunting you. Intensity
   * rises as it closes: the filter opens and the tremolo speeds up.
   */
  startChase() {
    const ctx = this._ensure();
    if (this.chase) return;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 1.2);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 260;
    filter.Q.value = 2.5;

    // tremolo, so it pulses rather than drones
    const tremolo = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 3.4;
    lfoGain.gain.value = 0.45;
    lfo.connect(lfoGain).connect(tremolo.gain);
    tremolo.gain.value = 0.55;
    lfo.start();

    const oscs = [73.4, 77.8, 146.8].map((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'square' : 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start();
      return osc;
    });

    filter.connect(tremolo).connect(gain).connect(this.master);
    this.chase = { gain, filter, tremolo, lfo, oscs };
  }

  /** 0 when it is far, 1 when it is on you. */
  setChaseIntensity(value) {
    if (!this.chase) return;
    const v = Math.max(0, Math.min(1, value));
    const t = this._ensure().currentTime;
    this.chase.gain.gain.linearRampToValueAtTime(0.05 + v * 0.16, t + 0.3);
    this.chase.filter.frequency.linearRampToValueAtTime(240 + v * 900, t + 0.3);
    this.chase.lfo.frequency.linearRampToValueAtTime(2.6 + v * 5.5, t + 0.3);
  }

  stopChase() {
    if (!this.chase) return;
    const { gain, oscs, lfo } = this.chase;
    const t = this._ensure().currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 1.4);
    setTimeout(() => {
      oscs.forEach((o) => o.stop());
      lfo.stop();
    }, 1600);
    this.chase = null;
  }

  /** A single thump. The entity drives the rate off how close it is. */
  heartbeat(strength = 1) {
    const ctx = this._ensure();
    const t = ctx.currentTime;
    for (const [delay, level] of [[0, 0.16], [0.17, 0.11]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(72, t + delay);
      osc.frequency.exponentialRampToValueAtTime(38, t + delay + 0.16);
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(level * strength, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.22);
      osc.connect(gain).connect(this.master);
      osc.start(t + delay);
      osc.stop(t + delay + 0.3);
    }
  }

  /** The moment it reaches you. */
  caught() {
    this.stopChase();
    this._noise({ duration: 1.1, type: 'bandpass', freq: 2600, q: 1.2, volume: 0.3, sweepTo: 180 });
    this._tone(1180, 0.5, 'sawtooth', 0.16);
    this._tone(1240, 0.5, 'sawtooth', 0.16, 0.02);
    this.stinger();
  }

  /** Everything gets duller when you are inside a cabinet with the door shut. */
  setMuffled(muffled) {
    const ctx = this._ensure();
    if (!this.muffle) {
      this.muffle = ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = 22000;
      this.master.disconnect();
      this.master.connect(this.muffle).connect(ctx.destination);
    }
    this.muffle.frequency.linearRampToValueAtTime(
      muffled ? 480 : 22000, ctx.currentTime + 0.35,
    );
  }

  /** A fluorescent tube striking, or trying to. */
  ballastBuzz(pan = 0) {
    for (let i = 0; i < 5; i++) {
      this._noise({ duration: 0.05, freq: 3200, q: 2, volume: 0.06, pan, delay: i * 0.09 });
      this._tone(120, 0.05, 'square', 0.05, i * 0.09, pan);
    }
  }
}
