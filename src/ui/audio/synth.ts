// Procedural sound voices (WebAudio). Every sound in Tinyhaven is synthesised here:
// noise beds, birds, gulls, crickets, bells, horns, hisses, fireworks, a carousel tune…
// Voices schedule themselves at AudioContext time `t` into the node `out` and clean up
// after they finish.

export interface NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

export function makeNoise(ac: BaseAudioContext, seconds = 4): NoiseBank {
  const n = Math.floor(ac.sampleRate * seconds);
  const white = ac.createBuffer(1, n, ac.sampleRate);
  const pink = ac.createBuffer(1, n, ac.sampleRate);
  const brown = ac.createBuffer(1, n, ac.sampleRate);
  const w = white.getChannelData(0),
    p = pink.getChannelData(0),
    b = brown.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0,
    last = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x * 0.6;
    // Paul Kellet's refined pink filter
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    b[i] = last * 3.2;
  }
  // smooth the loop seam
  const fade = Math.min(2048, n >> 4);
  for (const arr of [w, p, b]) {
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      arr[n - fade + i] = arr[n - fade + i] * (1 - t) + arr[i] * t;
    }
  }
  return { white, pink, brown };
}

export function makeImpulse(ac: BaseAudioContext, seconds = 2.2, decay = 3.2): AudioBuffer {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, n, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 90 ? i / 90 : 1);
    }
  }
  return buf;
}

/** looping noise → filter chain, returns the output gain (starts silent) */
export function noiseBed(ac: BaseAudioContext, buf: AudioBuffer, filters: BiquadFilterNode[], out: AudioNode): { src: AudioBufferSourceNode; gain: GainNode } {
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = Math.random() * 0.5;
  let node: AudioNode = src;
  for (const f of filters) {
    node.connect(f);
    node = f;
  }
  const gain = ac.createGain();
  gain.gain.value = 0;
  node.connect(gain);
  gain.connect(out);
  src.start(ac.currentTime + Math.random() * 0.05, Math.random() * (buf.duration - 0.5));
  return { src, gain };
}

export function biquad(ac: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7, gain = 0): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

function env(g: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  // the intrinsic value applies before the first event: keep it silent
  g.value = 0;
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function stopAfter(nodes: (AudioScheduledSourceNode | null)[], t: number, cleanup: AudioNode[]): void {
  const first = nodes.find((n) => n) as AudioScheduledSourceNode | undefined;
  for (const n of nodes) n?.stop(t);
  if (first)
    first.onended = () => {
      for (const c of cleanup) {
        try {
          c.disconnect();
        } catch {
          /* already gone */
        }
      }
    };
}

// ───────────────────────────────────────────── birds

export type BirdSpecies = 'tit' | 'trill' | 'warble' | 'coo' | 'robin';

export function bird(ac: BaseAudioContext, out: AudioNode, t: number, species: BirdSpecies, level = 1): number {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  const g = ac.createGain();
  g.gain.value = 0;
  const hp = biquad(ac, 'highpass', species === 'coo' ? 200 : 1400, 0.7);
  osc.connect(g);
  g.connect(hp);
  hp.connect(out);
  const f = osc.frequency;
  let tt = t;
  const note = (f0: number, f1: number, dur: number, amp: number, gapAfter: number) => {
    f.setValueAtTime(f0, tt);
    f.exponentialRampToValueAtTime(f1, tt + dur);
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(amp * level, tt + Math.min(0.012, dur * 0.25));
    g.gain.setValueAtTime(amp * level, tt + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, tt + dur);
    tt += dur + gapAfter;
  };
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  switch (species) {
    case 'tit': {
      // "tee-cher tee-cher tee-cher"
      const hi = r(4300, 5200),
        lo = hi * r(0.72, 0.8);
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        note(hi, hi * 0.97, 0.07, 0.11, 0.03);
        note(lo, lo * 0.95, 0.09, 0.09, 0.12);
      }
      break;
    }
    case 'trill': {
      const base = r(3300, 4300);
      const n = 8 + Math.floor(Math.random() * 9);
      for (let i = 0; i < n; i++) {
        const fi = base * (1 - i * 0.012);
        note(fi * 1.08, fi, 0.028, 0.08, 0.018);
      }
      break;
    }
    case 'robin': {
      const n = 4 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        const fa = r(2400, 5600),
          fb = fa * r(0.7, 1.35);
        note(fa, fb, r(0.05, 0.16), r(0.06, 0.11), r(0.02, 0.09));
      }
      break;
    }
    case 'warble': {
      const n = 6 + Math.floor(Math.random() * 7);
      let fa = r(2600, 3600);
      for (let i = 0; i < n; i++) {
        const fb = Math.min(6200, Math.max(1800, fa * r(0.82, 1.22)));
        note(fa, fb, r(0.04, 0.09), 0.07, 0.01);
        fa = fb;
      }
      break;
    }
    case 'coo': {
      // wood pigeon: "coo-COO-coo coo-coo"
      osc.type = 'triangle';
      const base = r(430, 520);
      const pattern = [0.8, 1.05, 0.85, 0.75, 0.75];
      for (let i = 0; i < pattern.length; i++) {
        note(base * pattern[i] * 1.02, base * pattern[i] * 0.95, i === 1 ? 0.42 : 0.24, i === 1 ? 0.13 : 0.09, i === 2 ? 0.35 : 0.1);
      }
      break;
    }
  }
  osc.start(t);
  stopAfter([osc], tt + 0.05, [osc, g, hp]);
  return tt - t;
}

// ───────────────────────────────────────────── gulls

export function gull(ac: BaseAudioContext, out: AudioNode, t: number, level = 1): number {
  const n = 2 + Math.floor(Math.random() * 4);
  const base = 850 + Math.random() * 350;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  const bp = biquad(ac, 'bandpass', 1750, 3.2);
  const bp2 = biquad(ac, 'peaking', 3200, 2, 6);
  const lp = biquad(ac, 'lowpass', 4200, 0.8);
  const g = ac.createGain();
  g.gain.value = 0;
  osc.connect(bp);
  bp.connect(bp2);
  bp2.connect(lp);
  lp.connect(g);
  g.connect(out);
  let tt = t;
  for (let i = 0; i < n; i++) {
    const first = i === 0;
    const up = first ? 0.09 : 0.05;
    const dur = first ? 0.42 : 0.24 + Math.random() * 0.08;
    const f0 = base * (first ? 1 : 1.12);
    osc.frequency.setValueAtTime(f0 * 0.82, tt);
    osc.frequency.linearRampToValueAtTime(f0 * 1.55, tt + up);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.9, tt + dur);
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(0.16 * level, tt + up * 0.6);
    g.gain.setValueAtTime(0.14 * level, tt + dur * 0.55);
    g.gain.linearRampToValueAtTime(0, tt + dur);
    tt += dur + 0.06 + Math.random() * 0.08;
  }
  osc.start(t);
  stopAfter([osc], tt + 0.05, [osc, bp, bp2, lp, g]);
  return tt - t;
}

// ───────────────────────────────────────────── crickets (continuous voice, scheduled pulses)

export class Cricket {
  private osc: OscillatorNode;
  readonly gain: GainNode;
  private next = 0;
  private pulses: number;
  private rate: number;

  constructor(
    private ac: BaseAudioContext,
    out: AudioNode,
    freq: number,
  ) {
    this.osc = ac.createOscillator();
    this.osc.type = 'sine';
    this.osc.frequency.value = freq;
    this.gain = ac.createGain();
    this.gain.gain.value = 0;
    this.osc.connect(this.gain);
    this.gain.connect(out);
    this.osc.start();
    this.pulses = 2 + Math.floor(Math.random() * 3);
    this.rate = 26 + Math.random() * 10;
    this.next = ac.currentTime + Math.random();
  }

  /** schedule chirps up to `ahead` seconds in advance */
  schedule(now: number, ahead: number, level: number): void {
    if (level < 0.01) {
      this.next = Math.max(this.next, now + 0.3);
      return;
    }
    while (this.next < now + ahead) {
      const t = Math.max(this.next, now + 0.01);
      const g = this.gain.gain;
      const pw = 1 / this.rate;
      for (let i = 0; i < this.pulses; i++) {
        const a = t + i * pw;
        g.setValueAtTime(0, a);
        g.linearRampToValueAtTime(0.05 * level, a + pw * 0.3);
        g.linearRampToValueAtTime(0, a + pw * 0.75);
      }
      this.next = t + this.pulses * pw + 0.35 + Math.random() * 0.55;
    }
  }

  dispose(): void {
    try {
      this.osc.stop();
      this.osc.disconnect();
      this.gain.disconnect();
    } catch {
      /* ignore */
    }
  }
}

// ───────────────────────────────────────────── bells

const CHURCH_PARTIALS: [number, number, number][] = [
  // ratio, amplitude, decay (s)
  [0.5, 0.32, 7],
  [1.0, 0.7, 5],
  [1.19, 0.42, 3.8],
  [1.5, 0.3, 3.2],
  [2.0, 0.42, 2.6],
  [2.52, 0.2, 2.0],
  [2.67, 0.16, 1.8],
  [3.01, 0.14, 1.4],
  [4.16, 0.09, 1.0],
  [5.43, 0.06, 0.7],
];

/** one strike of a large tower bell */
export function churchBell(ac: BaseAudioContext, out: AudioNode, t: number, f0 = 196, level = 1): void {
  const nodes: AudioNode[] = [];
  const oscs: OscillatorNode[] = [];
  const sum = ac.createGain();
  sum.gain.value = level * 0.32;
  sum.connect(out);
  nodes.push(sum);
  let maxDecay = 0;
  for (const [ratio, amp, decay] of CHURCH_PARTIALS) {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = f0 * ratio * (1 + (Math.random() - 0.5) * 0.002);
    const g = ac.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(sum);
    o.start(t);
    oscs.push(o);
    nodes.push(o, g);
    maxDecay = Math.max(maxDecay, decay);
  }
  stopAfter(oscs, t + maxDecay + 0.1, nodes);
}

/** small bright electric bell of a level crossing */
export function crossingDing(ac: BaseAudioContext, out: AudioNode, t: number, level = 1): void {
  const nodes: AudioNode[] = [];
  const oscs: OscillatorNode[] = [];
  const g = ac.createGain();
  g.gain.value = level * 0.22;
  g.connect(out);
  nodes.push(g);
  for (const [f, a, d] of [
    [1480, 0.6, 0.5],
    [2960 * 1.003, 0.32, 0.3],
    [4410, 0.12, 0.16],
  ] as [number, number, number][]) {
    const o = ac.createOscillator();
    o.frequency.value = f;
    const og = ac.createGain();
    env(og.gain, t, a, 0.003, d);
    o.connect(og);
    og.connect(g);
    o.start(t);
    oscs.push(o);
    nodes.push(o, og);
  }
  stopAfter(oscs, t + 0.6, nodes);
}

// ───────────────────────────────────────────── horns & engines

/** two-tone train horn chord (short + long) */
export function trainHorn(ac: BaseAudioContext, out: AudioNode, t: number, level = 1): void {
  const nodes: AudioNode[] = [];
  const oscs: OscillatorNode[] = [];
  const lp = biquad(ac, 'lowpass', 1900, 0.9);
  const g = ac.createGain();
  g.gain.value = 0;
  lp.connect(g);
  g.connect(out);
  nodes.push(lp, g);
  for (const f of [311.1, 369.99, 466.16]) {
    for (const det of [-3, 3]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      oscs.push(o);
      nodes.push(o);
    }
  }
  const blast = (a: number, len: number) => {
    g.gain.setValueAtTime(0, a);
    g.gain.linearRampToValueAtTime(0.055 * level, a + 0.07);
    g.gain.setValueAtTime(0.05 * level, a + len - 0.12);
    g.gain.linearRampToValueAtTime(0, a + len);
  };
  blast(t, 0.42);
  blast(t + 0.62, 1.15);
  stopAfter(oscs, t + 1.9, nodes);
}

/** deep ship horn */
export function shipHorn(ac: BaseAudioContext, out: AudioNode, t: number, level = 1): void {
  const nodes: AudioNode[] = [];
  const oscs: OscillatorNode[] = [];
  const lp = biquad(ac, 'lowpass', 520, 1.2);
  const g = ac.createGain();
  g.gain.value = 0;
  lp.connect(g);
  g.connect(out);
  nodes.push(lp, g);
  for (const f of [92.5, 138.6, 185]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(lp);
    o.start(t);
    oscs.push(o);
    nodes.push(o);
  }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.11 * level, t + 0.35);
  g.gain.setValueAtTime(0.1 * level, t + 2.3);
  g.gain.linearRampToValueAtTime(0, t + 3.1);
  stopAfter(oscs, t + 3.2, nodes);
}

/** polite little car horn "beep-beep" */
export function carHorn(ac: BaseAudioContext, out: AudioNode, t: number, level = 1): void {
  const nodes: AudioNode[] = [];
  const oscs: OscillatorNode[] = [];
  const bp = biquad(ac, 'bandpass', 900, 1.4);
  const g = ac.createGain();
  g.gain.value = 0;
  bp.connect(g);
  g.connect(out);
  nodes.push(bp, g);
  const base = 380 + Math.random() * 120;
  for (const f of [base, base * 1.26]) {
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(bp);
    o.start(t);
    oscs.push(o);
    nodes.push(o);
  }
  const twice = Math.random() < 0.6;
  const beep = (a: number, len: number) => {
    g.gain.setValueAtTime(0, a);
    g.gain.linearRampToValueAtTime(0.05 * level, a + 0.015);
    g.gain.setValueAtTime(0.05 * level, a + len - 0.02);
    g.gain.linearRampToValueAtTime(0, a + len);
  };
  beep(t, 0.14);
  if (twice) beep(t + 0.22, 0.2);
  stopAfter(oscs, t + 0.5, nodes);
}

/** pneumatic bus door / kneeling hiss */
export function airHiss(ac: BaseAudioContext, out: AudioNode, noise: NoiseBank, t: number, level = 1, long = true): void {
  const src = ac.createBufferSource();
  src.buffer = noise.white;
  const hp = biquad(ac, 'highpass', 2200, 0.7);
  const pk = biquad(ac, 'peaking', 5200, 1.2, 5);
  const g = ac.createGain();
  src.connect(hp);
  hp.connect(pk);
  pk.connect(g);
  g.connect(out);
  const len = long ? 0.75 : 0.4;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.16 * level, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.03 * level, t + len * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  // door thunk
  const tt = t + len * 0.85;
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, tt);
  o.frequency.exponentialRampToValueAtTime(60, tt + 0.12);
  const og = ac.createGain();
  env(og.gain, tt, 0.12 * level, 0.004, 0.14);
  o.connect(og);
  og.connect(out);
  src.start(t, Math.random() * Math.max(0, noise.white.duration - len - 0.5));
  o.start(tt);
  stopAfter([src, o], t + len + 0.3, [src, hp, pk, g, o, og]);
}

/** brake squeal of an arriving train */
export function brakeSqueal(ac: BaseAudioContext, out: AudioNode, t: number, level = 1): void {
  const o = ac.createOscillator();
  o.type = 'triangle';
  const f = 2600 + Math.random() * 900;
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * 0.94, t + 2.2);
  const vib = ac.createOscillator();
  vib.frequency.value = 7;
  const vg = ac.createGain();
  vg.gain.value = 14;
  vib.connect(vg);
  vg.connect(o.frequency);
  const g = ac.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.034 * level, t + 0.4);
  g.gain.setValueAtTime(0.038 * level, t + 1.6);
  g.gain.linearRampToValueAtTime(0, t + 2.3);
  o.connect(g);
  g.connect(out);
  o.start(t);
  vib.start(t);
  stopAfter([o, vib], t + 2.4, [o, vib, vg, g]);
}

// ───────────────────────────────────────────── fireworks

export function firework(ac: BaseAudioContext, out: AudioNode, noise: NoiseBank, t: number, delay: number, level = 1): void {
  // launch whistle
  const w = ac.createOscillator();
  w.type = 'sine';
  w.frequency.setValueAtTime(700, t);
  w.frequency.exponentialRampToValueAtTime(2300, t + 1.1);
  const wg = ac.createGain();
  wg.gain.setValueAtTime(0, t);
  wg.gain.linearRampToValueAtTime(0.025 * level, t + 0.15);
  wg.gain.linearRampToValueAtTime(0, t + 1.15);
  w.connect(wg);
  wg.connect(out);
  w.start(t);
  // bang (arrives after the light: sound travels ~340 m/s)
  const tb = t + 1.2 + delay;
  const src = ac.createBufferSource();
  src.buffer = noise.brown;
  const lp = biquad(ac, 'lowpass', 1600, 0.6);
  lp.frequency.setValueAtTime(2200, tb);
  lp.frequency.exponentialRampToValueAtTime(180, tb + 1.2);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, tb);
  g.gain.linearRampToValueAtTime(0.9 * level, tb + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, tb + 1.6);
  src.connect(lp);
  lp.connect(g);
  g.connect(out);
  src.start(tb, Math.random() * 2);
  const thump = ac.createOscillator();
  thump.frequency.setValueAtTime(90, tb);
  thump.frequency.exponentialRampToValueAtTime(38, tb + 0.4);
  const tg = ac.createGain();
  env(tg.gain, tb, 0.35 * level, 0.005, 0.5);
  thump.connect(tg);
  tg.connect(out);
  thump.start(tb);
  // crackle
  const cr = ac.createBufferSource();
  cr.buffer = noise.white;
  const hp = biquad(ac, 'highpass', 3000, 0.7);
  const cg = ac.createGain();
  cg.gain.value = 0;
  for (let i = 0; i < 26; i++) {
    const a = tb + 0.25 + Math.random() * 1.4;
    cg.gain.setValueAtTime(0, a);
    cg.gain.linearRampToValueAtTime((0.08 + Math.random() * 0.1) * level, a + 0.004);
    cg.gain.linearRampToValueAtTime(0, a + 0.02 + Math.random() * 0.02);
  }
  cr.connect(hp);
  hp.connect(cg);
  cg.connect(out);
  cr.start(tb, Math.random() * 2);
  stopAfter([w, src, thump, cr], tb + 2, [w, wg, src, lp, g, thump, tg, cr, hp, cg]);
}

// ───────────────────────────────────────────── construction & misc

export function clank(ac: BaseAudioContext, out: AudioNode, t: number, level = 1): void {
  const nodes: AudioNode[] = [];
  const oscs: OscillatorNode[] = [];
  const g = ac.createGain();
  g.gain.value = level * 0.06;
  g.connect(out);
  nodes.push(g);
  const base = 380 + Math.random() * 220;
  for (const [r, a, d] of [
    [1, 0.6, 0.3],
    [2.76, 0.4, 0.22],
    [5.4, 0.3, 0.12],
    [8.93, 0.2, 0.08],
  ] as [number, number, number][]) {
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.value = base * r;
    const og = ac.createGain();
    env(og.gain, t, a, 0.002, d);
    o.connect(og);
    og.connect(g);
    o.start(t);
    oscs.push(o);
    nodes.push(o, og);
  }
  stopAfter(oscs, t + 0.4, nodes);
}

// ───────────────────────────────────────────── carousel music box

const WALTZ: [number, number][] = [
  // semitone offsets from the root, beats (3/4 time)
  [7, 1], [12, 1], [11, 1], [9, 2], [7, 1], [4, 1], [5, 1], [7, 1], [2, 3],
  [5, 1], [9, 1], [7, 1], [5, 2], [4, 1], [0, 1], [2, 1], [4, 1], [0, 3],
];

/** schedules one phrase of a music-box waltz; returns its duration */
export function musicBoxPhrase(ac: BaseAudioContext, out: AudioNode, t: number, level = 1, root = 523.25): number {
  const beat = 0.34;
  let tt = t;
  const nodes: AudioNode[] = [];
  const oscs: OscillatorNode[] = [];
  const g = ac.createGain();
  g.gain.value = level * 0.05;
  g.connect(out);
  nodes.push(g);
  let lastEnd = 0;
  let lastOsc: OscillatorNode | null = null;
  const tone = (freq: number, a: number, amp: number) => {
    for (const [mult, pa, d] of [
      [1, 1, 1.2],
      [2, 0.25, 0.5],
      [3.01, 0.12, 0.25],
    ] as [number, number, number][]) {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const og = ac.createGain();
      env(og.gain, a, amp * pa, 0.004, d);
      o.connect(og);
      og.connect(g);
      o.start(a);
      const end = a + d + 0.05;
      o.stop(end);
      if (end >= lastEnd) {
        lastEnd = end;
        lastOsc = o;
      }
      oscs.push(o);
      nodes.push(o, og);
    }
  };
  for (let i = 0; i < WALTZ.length; i++) {
    const [semi, beats] = WALTZ[i];
    tone(root * Math.pow(2, semi / 12), tt, 1);
    // oom-pah-pah accompaniment on the bar starts
    if (i % 3 === 0) tone((root / 2) * Math.pow(2, (i % 6 === 0 ? 0 : 7) / 12), tt, 0.6);
    tt += beat * beats;
  }
  const last = lastOsc as OscillatorNode | null;
  if (last)
    last.onended = () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    };
  return tt - t;
}
