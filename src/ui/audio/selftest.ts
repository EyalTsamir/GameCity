// Offline render check of every synthesised voice: renders each into an
// OfflineAudioContext and reports peak / RMS so automated tests can verify the
// sounds are audible, finite and not clipping — without speakers.

import { makeNoise, bird, gull, Cricket, churchBell, crossingDing, trainHorn, shipHorn, carHorn, airHiss, brakeSqueal, firework, clank, musicBoxPhrase } from './synth';

export interface VoiceReport {
  peak: number;
  rms: number;
  finite: boolean;
}

type Voice = (ac: OfflineAudioContext, out: AudioNode, noise: ReturnType<typeof makeNoise>) => void;

const VOICES: Record<string, { secs: number; play: Voice }> = {
  bird_tit: { secs: 1.5, play: (ac, o) => void bird(ac, o, 0.05, 'tit') },
  bird_trill: { secs: 1.5, play: (ac, o) => void bird(ac, o, 0.05, 'trill') },
  bird_coo: { secs: 3, play: (ac, o) => void bird(ac, o, 0.05, 'coo') },
  gull: { secs: 2.5, play: (ac, o) => void gull(ac, o, 0.05) },
  cricket: {
    secs: 2,
    play: (ac, o) => {
      const c = new Cricket(ac, o, 4600);
      c.schedule(0, 1.8, 1);
    },
  },
  church_bell: { secs: 5, play: (ac, o) => churchBell(ac, o, 0.05, 174.6) },
  crossing: { secs: 1, play: (ac, o) => crossingDing(ac, o, 0.05) },
  train_horn: { secs: 2.2, play: (ac, o) => trainHorn(ac, o, 0.05) },
  ship_horn: { secs: 3.4, play: (ac, o) => shipHorn(ac, o, 0.05) },
  car_horn: { secs: 0.8, play: (ac, o) => carHorn(ac, o, 0.05) },
  bus_hiss: { secs: 1.3, play: (ac, o, n) => airHiss(ac, o, n, 0.05) },
  brakes: { secs: 2.6, play: (ac, o) => brakeSqueal(ac, o, 0.05) },
  firework: { secs: 4, play: (ac, o, n) => firework(ac, o, n, 0.05, 0.2) },
  clank: { secs: 0.6, play: (ac, o) => clank(ac, o, 0.05) },
  music_box: { secs: 9, play: (ac, o) => void musicBoxPhrase(ac, o, 0.05) },
};

export async function audioSelfTest(): Promise<Record<string, VoiceReport>> {
  const out: Record<string, VoiceReport> = {};
  const OAC = (window as Window & { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!OAC) return out;
  const rate = 22050;
  for (const [name, v] of Object.entries(VOICES)) {
    const ac = new OAC(1, Math.ceil(v.secs * rate), rate);
    const noise = makeNoise(ac, 2);
    v.play(ac, ac.destination, noise);
    const buf = await ac.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0,
      sum = 0,
      finite = true;
    for (let i = 0; i < d.length; i++) {
      const x = d[i];
      if (!Number.isFinite(x)) {
        finite = false;
        continue;
      }
      const a = Math.abs(x);
      if (a > peak) peak = a;
      sum += x * x;
    }
    out[name] = { peak: Math.round(peak * 1000) / 1000, rms: Math.round(Math.sqrt(sum / d.length) * 10000) / 10000, finite };
  }
  return out;
}
