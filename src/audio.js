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

  _tone(freq, duration, type = 'square', volume = 0.15, delay = 0) {
    const ctx = this._ensure();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
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

  footstep(sprinting) {
    const ctx = this._ensure();
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
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
    gain.gain.value = sprinting ? 0.16 : 0.1;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }
}
