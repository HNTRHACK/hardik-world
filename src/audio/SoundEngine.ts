/**
 * Every sound in the lane, synthesised live with the Web Audio API: no audio
 * files at all (0 bytes to download). This module is its own chunk and is only
 * imported after the visitor turns sound on.
 *
 * Continuous layers (engine, tyre squeal, horn, street hum, sea) are built once
 * and steered every frame; one-shots (thuds, distant honks, birds, chai clinks,
 * parcel thumps) are scheduled on the fly and panned toward where they happen.
 */

export interface SoundFrame {
  dt: number;
  /** forward speed, m/s */
  speed: number;
  throttle: number;
  boost: boolean;
  horn: boolean;
  /** 0..1 how hard the tyres are sliding */
  skid: number;
  /** 0..1 a collision this frame */
  impact: number;
  /** listener (rickshaw) position, and the camera's right vector (for panning) */
  x: number;
  z: number;
  rightX: number;
  rightZ: number;
  /** horizontal distance to the sea wall, m */
  seaDistance: number;
  /** positions of the chai stall and the courier depot */
  chai: { x: number; z: number } | null;
  omen: { x: number; z: number } | null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class SoundEngine {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly noise: AudioBuffer;
  // engine
  private readonly engOsc1: OscillatorNode;
  private readonly engOsc2: OscillatorNode;
  private readonly engLfo: OscillatorNode;
  private readonly engFilter: BiquadFilterNode;
  private readonly engVol: GainNode;
  // squeal, horn, ambience
  private readonly squealVol: GainNode;
  private readonly squealOsc: OscillatorNode;
  private readonly hornVol: GainNode;
  private readonly streetVol: GainNode;
  private readonly seaVol: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private t = 0;
  private next = { honk: rand(2, 5), birds: rand(3, 8), chai: 1, omen: 1.5 };
  private lastHorn = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp).connect(ctx.destination);

    // Two seconds of white noise, looped by every noisy layer (with different filters).
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // ── Engine: a two-stroke putter. Saw + sub-square, low-passed, chopped by a square LFO. ──
    this.engOsc1 = this.osc('sawtooth', 44);
    this.engOsc2 = this.osc('square', 22);
    const o2 = this.gain(0.5);
    this.engOsc2.connect(o2);
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 500;
    this.engFilter.Q.value = 2.5;
    const chop = this.gain(0.55);
    this.engLfo = this.osc('square', 22);
    const depth = this.gain(0.45);
    this.engLfo.connect(depth).connect(chop.gain);
    this.engVol = this.gain(0);
    this.engOsc1.connect(this.engFilter);
    o2.connect(this.engFilter);
    this.engFilter.connect(chop).connect(this.engVol).connect(this.master);

    // ── Tyre squeal: narrow band of noise plus a wavering tone. ──
    this.squealVol = this.gain(0);
    const sq = this.loopNoise();
    const bp = this.filter('bandpass', 2300, 9);
    sq.connect(bp).connect(this.squealVol);
    this.squealOsc = this.osc('triangle', 1150);
    const sqTone = this.gain(0.35);
    this.squealOsc.connect(sqTone).connect(this.squealVol);
    this.squealVol.connect(this.master);

    // ── Horn: a rickshaw's nasal electric beep, two detuned squares through a band-pass. ──
    this.hornVol = this.gain(0);
    const hf = this.filter('bandpass', 1100, 1.4);
    for (const f of [440, 554]) this.osc('square', f).connect(hf);
    hf.connect(this.hornVol).connect(this.master);

    // ── Street hum (distant traffic) and the sea (swelling surf). ──
    this.streetVol = this.gain(0.03);
    this.loopNoise().connect(this.filter('lowpass', 380, 0.7)).connect(this.streetVol).connect(this.master);
    const murmur = this.gain(0.25);
    this.loopNoise(0.7).connect(this.filter('bandpass', 900, 0.8)).connect(murmur).connect(this.streetVol);
    this.seaVol = this.gain(0);
    this.loopNoise(1.3).connect(this.filter('lowpass', 650, 0.5)).connect(this.seaVol).connect(this.master);
  }

  /** Fade everything in or out (unmute / mute). */
  setEnabled(on: boolean): void {
    this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, on ? 0.25 : 0.08);
  }

  update(f: SoundFrame): void {
    const now = this.ctx.currentTime;
    this.t += f.dt;
    const set = (p: AudioParam, v: number, tc = 0.06) => p.setTargetAtTime(v, now, tc);

    // Engine pitch follows road speed (and revs up a little with throttle / boost).
    const rpm = clamp01(Math.abs(f.speed) / 22);
    const rev = Math.abs(f.throttle) * (f.boost ? 1 : 0.6);
    const freq = 38 + rpm * 78 + rev * 10;
    set(this.engOsc1.frequency, freq);
    set(this.engOsc2.frequency, freq / 2);
    set(this.engLfo.frequency, freq / 2);
    set(this.engFilter.frequency, 380 + rpm * 1300 + rev * 500);
    set(this.engVol.gain, 0.07 + rpm * 0.07 + rev * 0.05);

    set(this.squealVol.gain, f.skid * 0.1, 0.04);
    set(this.squealOsc.frequency, 1050 + Math.sin(this.t * 23) * 60 + rpm * 200);

    if (f.horn !== this.lastHorn) {
      set(this.hornVol.gain, f.horn ? 0.11 : 0, 0.012);
      this.lastHorn = f.horn;
    }

    // Sea: always faintly there, swelling every ~7 s, much louder on Marine Drive.
    const near = clamp01(1 - (f.seaDistance - 4) / 50);
    const swell = Math.pow(0.5 + 0.5 * Math.sin((this.t * Math.PI * 2) / 7), 2);
    set(this.seaVol.gain, (0.015 + 0.09 * near) * (0.35 + 0.65 * swell), 0.4);
    set(this.streetVol.gain, 0.03 * (1 - near * 0.5), 0.5);

    if (f.impact > 0) this.thud(f.impact, 0);

    // One-shots on their own clocks.
    const pan = (x: number, z: number) => {
      const dx = x - f.x;
      const dz = z - f.z;
      const len = Math.hypot(dx, dz) || 1;
      return Math.max(-0.9, Math.min(0.9, (dx * f.rightX + dz * f.rightZ) / len));
    };
    if ((this.next.honk -= f.dt) <= 0) {
      this.next.honk = rand(3, 9);
      this.honk(rand(-0.8, 0.8));
    }
    if ((this.next.birds -= f.dt) <= 0) {
      this.next.birds = rand(5, 14);
      this.birds(rand(-0.7, 0.7));
    }
    const chaiD = f.chai ? Math.hypot(f.chai.x - f.x, f.chai.z - f.z) : Infinity;
    if (chaiD < 18 && (this.next.chai -= f.dt) <= 0) {
      this.next.chai = rand(1.8, 4.5);
      this.clink(clamp01(1 - chaiD / 18), pan(f.chai!.x, f.chai!.z));
    }
    const omenD = f.omen ? Math.hypot(f.omen.x - f.x, f.omen.z - f.z) : Infinity;
    if (omenD < 20 && (this.next.omen -= f.dt) <= 0) {
      this.next.omen = rand(3.5, 7);
      this.parcel(clamp01(1 - omenD / 20), pan(f.omen!.x, f.omen!.z));
    }
  }

  // ── one-shots ──

  /** Soft collision thud: a falling sine with a dull noise knock. */
  private thud(strength: number, pan: number): void {
    const now = this.ctx.currentTime;
    const out = this.panner(pan);
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(42, now + 0.2);
    const g = this.env(0.5 * strength, 0.005, 0.28);
    o.connect(g).connect(out);
    this.burst(out, 0.25 * strength, 320, 0.12);
    this.oneShot(o, 0.35);
  }

  /** A distant honk somewhere in the city: one or two short beeps. */
  private honk(pan: number): void {
    const out = this.panner(pan);
    const lp = this.filter('lowpass', 1600, 0.7);
    lp.connect(out);
    const f = rand(360, 620);
    const n = Math.random() < 0.4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const start = this.ctx.currentTime + i * 0.22;
      const len = rand(0.1, 0.28);
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = this.env(0.013, 0.01, len, start);
      o.connect(g).connect(lp);
      this.oneShot(o, len + 0.05, start);
    }
  }

  /** A few quick chirps. */
  private birds(pan: number): void {
    const out = this.panner(pan);
    const base = rand(2600, 4000);
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const start = this.ctx.currentTime + i * rand(0.09, 0.16);
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base, start);
      o.frequency.exponentialRampToValueAtTime(base * rand(1.15, 1.45), start + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, start + 0.08);
      const g = this.env(0.022, 0.006, 0.08, start);
      o.connect(g).connect(out);
      this.oneShot(o, 0.12, start);
    }
  }

  /** Spoon on a cutting-chai glass: bright inharmonic partials, sometimes a quick stir. */
  private clink(near: number, pan: number): void {
    const out = this.panner(pan);
    const n = Math.random() < 0.45 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const start = this.ctx.currentTime + i * rand(0.1, 0.16);
      const pitch = rand(0.96, 1.05);
      [2350, 3610, 5230].forEach((f, k) => {
        const o = this.ctx.createOscillator();
        o.frequency.value = f * pitch;
        const g = this.env((0.05 / (k + 1)) * near, 0.002, 0.35 - k * 0.08, start);
        o.connect(g).connect(out);
        this.oneShot(o, 0.4, start);
      });
    }
  }

  /** A parcel dropped on the depot floor: dull thump plus a cardboard scuff. */
  private parcel(near: number, pan: number): void {
    const now = this.ctx.currentTime;
    const out = this.panner(pan);
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(105, now);
    o.frequency.exponentialRampToValueAtTime(50, now + 0.15);
    o.connect(this.env(0.35 * near, 0.004, 0.22)).connect(out);
    this.oneShot(o, 0.3);
    this.burst(out, 0.12 * near, 700, 0.16, now + 0.05);
  }

  // ── plumbing ──

  private osc(type: OscillatorType, freq: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start();
    this.sources.push(o);
    return o;
  }

  private gain(v: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  private filter(type: BiquadFilterType, freq: number, q: number): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private loopNoise(rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.loopStart = Math.random();
    s.start(0, Math.random() * 1.9);
    this.sources.push(s);
    return s;
  }

  private panner(pan: number): AudioNode {
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.master);
    return p;
  }

  /** Attack / exponential-decay envelope as a gain node. */
  private env(peak: number, attack: number, decay: number, start = this.ctx.currentTime): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    return g;
  }

  /** A short filtered noise burst. */
  private burst(out: AudioNode, peak: number, freq: number, len: number, start = this.ctx.currentTime): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.connect(this.filter('lowpass', freq, 0.8)).connect(this.env(peak, 0.004, len, start)).connect(out);
    this.oneShot(s, len + 0.05, start, Math.random() * 1.5);
  }

  private oneShot(src: AudioScheduledSourceNode, length: number, start = this.ctx.currentTime, offset = 0): void {
    if (src instanceof AudioBufferSourceNode) src.start(start, offset, length);
    else src.start(start);
    src.stop(start + length);
  }

  dispose(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.master.disconnect();
  }
}
